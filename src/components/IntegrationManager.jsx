/**
 * ENTERPRISE API INTEGRATION MODULE
 * Third-party integrations, webhooks, partner APIs
 */

import React, { useState } from 'react';
import { Zap, Globe, Lock, CheckCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react';

/**
 * Available Integrations
 */
export const INTEGRATIONS = {
  STRIPE: {
    name: 'Stripe',
    icon: '💳',
    category: 'Payment',
    description: 'Accept payments online',
    status: 'not_connected',
  },
  GOOGLE_MAPS: {
    name: 'Google Maps',
    icon: '🗺️',
    category: 'Maps',
    description: 'Advanced routing and maps',
    status: 'connected',
  },
  SLACK: {
    name: 'Slack',
    icon: '💬',
    category: 'Communication',
    description: 'Send notifications to Slack',
    status: 'not_connected',
  },
  SALESFORCE: {
    name: 'Salesforce',
    icon: '☁️',
    category: 'CRM',
    description: 'Sync customer data',
    status: 'not_connected',
  },
  QUICKBOOKS: {
    name: 'QuickBooks',
    icon: '📊',
    category: 'Accounting',
    description: 'Accounting integration',
    status: 'not_connected',
  },
  TWILIO: {
    name: 'Telnyx',
    icon: '📞',
    category: 'Communication',
    description: 'SMS and voice messaging',
    status: 'connected',
  },
  ZENDESK: {
    name: 'Zendesk',
    icon: '🎯',
    category: 'Support',
    description: 'Customer support tickets',
    status: 'not_connected',
  },
  HUBSPOT: {
    name: 'HubSpot',
    icon: '📈',
    category: 'Marketing',
    description: 'Marketing automation',
    status: 'not_connected',
  },
};

const INTEGRATION_DOCS = {
  STRIPE: 'https://docs.stripe.com/api',
  GOOGLE_MAPS: 'https://developers.google.com/maps/documentation/javascript',
  SLACK: 'https://api.slack.com/docs',
  SALESFORCE: 'https://developer.salesforce.com/docs',
  QUICKBOOKS: 'https://developer.intuit.com/app/developer/qbo/docs/get-started',
  TWILIO: 'https://developers.telnyx.com/docs/v2/messaging',
  ZENDESK: 'https://developer.zendesk.com/api-reference/',
  HUBSPOT: 'https://developers.hubspot.com/docs/api/overview',
};

/**
 * API Configuration Component
 */
const APIConfiguration = ({ integrationKey, integration, onConnect }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleTest = async () => {
    // Simulate API test
    setTestResult({
      success: true,
      message: 'Connection successful!',
      timestamp: new Date().toLocaleString(),
    });
  };

  const handleConnect = () => {
    if (apiKey.length > 0) {
      onConnect(integrationKey, apiKey);
      setApiKey('');
      setTestResult(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">{integration.name}</h3>
        {integration.status === 'connected' && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
            <CheckCircle size={14} />
            Connected
          </span>
        )}
      </div>

      <p className="text-sm text-slate-600 mb-4">{integration.description}</p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-bold text-slate-900 mb-2">API Key</label>
          <div className="flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_test_..."
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {showKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={!apiKey}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Test Connection
          </button>
          <button
            onClick={handleConnect}
            disabled={!apiKey}
            className="flex-1 px-4 py-2 btn-gradient-primary text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Connect
          </button>
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg border text-sm ${
            testResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {testResult.message}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
        <p className="font-bold mb-1">📚 Documentation</p>
        <a href={INTEGRATION_DOCS[integrationKey]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          View {integration.name} API docs
        </a>
      </div>
    </div>
  );
};

/**
 * Webhook Management
 */
const WebhookManager = () => {
  const [webhooks, setWebhooks] = useState([
    { id: 1, url: 'https://agape-care.web.app/webhooks/trips', events: ['trip.created', 'trip.completed'], active: true },
    { id: 2, url: 'https://agape-care.web.app/webhooks/drivers', events: ['driver.online', 'driver.offline'], active: true },
  ]);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);

  const availableEvents = [
    'trip.created', 'trip.completed', 'trip.cancelled',
    'driver.online', 'driver.offline', 'driver.updated',
    'message.sent', 'message.received',
    'payment.received', 'payment.failed',
  ];

  const handleAddWebhook = () => {
    if (newUrl && selectedEvents.length > 0) {
      setWebhooks([...webhooks, {
        id: Math.max(...webhooks.map(w => w.id), 0) + 1,
        url: newUrl,
        events: selectedEvents,
        active: true,
      }]);
      setNewUrl('');
      setSelectedEvents([]);
    }
  };

  const handleDeleteWebhook = (id) => {
    setWebhooks(webhooks.filter(webhook => webhook.id !== id));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Webhooks</h3>

      {/* Current Webhooks */}
      <div className="space-y-3 mb-6">
        {webhooks.map(webhook => (
          <div key={webhook.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <p className="font-mono text-sm text-slate-900 break-all">{webhook.url}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {webhook.events.map(e => (
                    <span key={e} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {webhook.active && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                    Active
                  </span>
                )}
                <button onClick={() => handleDeleteWebhook(webhook.id)} className="text-red-600 hover:text-red-700 font-bold text-sm">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Webhook */}
      <div className="border-t border-slate-200 pt-4">
        <p className="font-bold text-slate-900 mb-3">Add Webhook</p>
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-3 focus:outline-none focus:border-blue-500 text-sm"
        />
        
        <div className="mb-3">
          <label className="text-sm font-bold text-slate-900 block mb-2">Events</label>
          <div className="grid grid-cols-2 gap-2">
            {availableEvents.map(event => (
              <label key={event} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(event)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedEvents([...selectedEvents, event]);
                    } else {
                      setSelectedEvents(selectedEvents.filter(e => e !== event));
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-xs text-slate-700">{event}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleAddWebhook}
          disabled={!newUrl || selectedEvents.length === 0}
          className="w-full px-4 py-2 btn-gradient-primary font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
        >
          Add Webhook
        </button>
      </div>
    </div>
  );
};

/**
 * API Documentation
 */
const APIDocumentation = () => {
  const endpoints = [
    {
      method: 'GET',
      path: '/api/v1/trips',
      description: 'Get all trips',
      auth: 'Bearer Token',
    },
    {
      method: 'POST',
      path: '/api/v1/trips',
      description: 'Create new trip',
      auth: 'Bearer Token',
    },
    {
      method: 'PUT',
      path: '/api/v1/trips/:id',
      description: 'Update trip',
      auth: 'Bearer Token',
    },
    {
      method: 'DELETE',
      path: '/api/v1/trips/:id',
      description: 'Delete trip',
      auth: 'Bearer Token',
    },
    {
      method: 'GET',
      path: '/api/v1/drivers',
      description: 'Get all drivers',
      auth: 'Bearer Token',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Globe size={20} className="text-blue-600" />
        API Documentation
      </h3>

      <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
        {endpoints.map((ep, i) => (
          <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-1 rounded font-bold text-white ${
                ep.method === 'GET' ? 'bg-blue-600' :
                ep.method === 'POST' ? 'bg-emerald-600' :
                ep.method === 'PUT' ? 'bg-amber-600' :
                'bg-red-600'
              }`}>
                {ep.method}
              </span>
              <span className="text-slate-900">{ep.path}</span>
            </div>
            <p className="text-slate-600">{ep.description}</p>
          </div>
        ))}
      </div>

      <a href="https://firebase.google.com/docs/functions" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold text-sm hover:underline flex items-center gap-1">
        View Full Documentation <ExternalLink size={14} />
      </a>
    </div>
  );
};

/**
 * Main Integration Manager
 */
const IntegrationManager = () => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(() =>
    Object.fromEntries(Object.entries(INTEGRATIONS).map(([key, integration]) => [key, integration.status]))
  );

  const categories = [...new Set(Object.values(INTEGRATIONS).map(i => i.category))];
  const filteredIntegrations = selectedCategory
    ? Object.entries(INTEGRATIONS).filter(([_, i]) => i.category === selectedCategory)
    : Object.entries(INTEGRATIONS);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-6">
        <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <Zap size={32} className="text-blue-600" />
          Integrations & API
        </h1>
        <p className="text-sm text-slate-500 mt-1">Connect third-party services and manage APIs</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              selectedCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredIntegrations.map(([key, integration]) => (
            <APIConfiguration
              key={key}
              integrationKey={key}
              integration={{ ...integration, status: connectionStatus[key] || integration.status }}
              onConnect={(integrationKey) => {
                setConnectionStatus(prev => ({ ...prev, [integrationKey]: 'connected' }));
              }}
            />
          ))}
        </div>

        {/* Developer Tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WebhookManager />
          <APIDocumentation />
        </div>
      </div>
    </div>
  );
};

export default IntegrationManager;
