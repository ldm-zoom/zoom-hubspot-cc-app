// Demo backend: Zoom App (Contact Center) <-> HubSpot
// Objetivo: dado um e-mail ou telefone vindo do engagement do Zoom Contact Center,
// buscar o contato no HubSpot e trazer negócios (pedidos) e tickets associados.
// Simplificado de propósito para demo — sem cache, sem retry, sem auth própria.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE = 'https://api.hubapi.com';

if (!HUBSPOT_TOKEN) {
  console.warn('[aviso] HUBSPOT_TOKEN não definido no .env — /api/customer vai falhar.');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function hsHeaders() {
  return {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function hsFetch(pathname, options) {
  const res = await fetch(HUBSPOT_BASE + pathname, {
    ...options,
    headers: { ...hsHeaders(), ...(options && options.headers) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot ${pathname} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function findContact(email, phone) {
  const filterGroups = [];
  if (email) filterGroups.push({ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] });
  if (phone) filterGroups.push({ filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] });
  if (filterGroups.length === 0) return null;

  const data = await hsFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups,
      properties: ['firstname', 'lastname', 'email', 'phone', 'city'],
      limit: 1,
    }),
  });
  return (data.results && data.results[0]) || null;
}

async function getAssociated(contactId, toObjectType, properties) {
  const assoc = await hsFetch(`/crm/v4/objects/contacts/${contactId}/associations/${toObjectType}`);
  const ids = (assoc.results || []).map(r => r.toObjectId).slice(0, 10);
  if (ids.length === 0) return [];

  const batch = await hsFetch(`/crm/v3/objects/${toObjectType}/batch/read`, {
    method: 'POST',
    body: JSON.stringify({
      inputs: ids.map(id => ({ id: String(id) })),
      properties,
    }),
  });
  return (batch.results || []).map(r => r.properties);
}

app.get('/api/customer', async (req, res) => {
  try {
    const { email, phone } = req.query;
    if (!email && !phone) {
      return res.status(400).json({ error: 'Informe email ou phone' });
    }

    const contact = await findContact(email, phone);
    if (!contact) {
      return res.json({ contact: null, deals: [], tickets: [] });
    }

    const [deals, tickets] = await Promise.all([
      getAssociated(contact.id, 'deals', ['dealname', 'dealstage', 'amount']),
      getAssociated(contact.id, 'tickets', ['subject', 'hs_pipeline_stage', 'hs_ticket_priority']),
    ]);

    res.json({
      contact: {
        id: contact.id,
        ...contact.properties,
        url: `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID || ''}/record/0-1/${contact.id}`,
      },
      deals,
      tickets,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao consultar HubSpot', detail: String(err.message || err) });
  }
});

// Atualiza campos do contato (ex.: telefone, cidade) a partir do painel.
// Escrita simples — em produção, validar identidade do agente antes de
// aceitar a chamada (ver nota de segurança no README).
app.patch('/api/customer/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const allowed = ['phone', 'city', 'firstname', 'lastname'];
    const properties = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) properties[key] = req.body[key];
    }
    if (Object.keys(properties).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo permitido enviado' });
    }

    const updated = await hsFetch(`/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    res.json({ contact: updated.properties });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao atualizar contato', detail: String(err.message || err) });
  }
});

// Registra uma nota (ex.: resumo do atendimento) associada ao contato.
app.post('/api/customer/:contactId/notes', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { body, engagementId } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Nota vazia' });
    }

    const noteBody = engagementId ? `[Engagement ${engagementId}] ${body}` : body;

    const note = await hsFetch('/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: Date.now(),
          hs_note_body: noteBody,
        },
      }),
    });

    // Associação padrão nota -> contato (API v4 "default" escolhe o tipo de
    // associação correto automaticamente).
    await hsFetch(`/crm/v4/objects/notes/${note.id}/associations/default/contacts/${contactId}`, {
      method: 'PUT',
    });

    res.json({ noteId: note.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao registrar nota', detail: String(err.message || err) });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Demo Zoom App + HubSpot rodando em http://localhost:${PORT}`);
  console.log('Exponha com ngrok e cadastre a URL no Zoom Marketplace (ver README.md).');
});
