/**
 * ADVANCED REPORTING & EXPORT MODULE
 * Generate reports, export data, analytics, custom dashboards
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Download, FileText, BarChart3, Calendar, Filter, Loader2, CheckCircle } from 'lucide-react';
import { aiGenerateReport } from '../config/aiAdvanced';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Report Template Types
 */
export const REPORT_TYPES = {
  TRIP_PERFORMANCE: 'trip_performance',
  DRIVER_ANALYTICS: 'driver_analytics',
  FINANCIAL_SUMMARY: 'financial_summary',
  COMPLIANCE_AUDIT: 'compliance_audit',
  CUSTOMER_SATISFACTION: 'customer_satisfaction',
  OPERATIONAL_KPI: 'operational_kpi',
};

/**
 * Generate PDF Report
 */
export const generatePDFReport = (title, content, data = {}) => {
  try {
    const doc = new jsPDF();

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(title, 14, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    // Content
    doc.setFontSize(12);
    let yPosition = 40;

    const lines = doc.splitTextToSize(content, 180);
    lines.forEach(line => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 14, yPosition);
      yPosition += 7;
    });

    // Tables if provided
    if (data.table) {
      doc.addPage();
      doc.autoTable({
        head: [data.table.headers],
        body: data.table.rows,
        startY: 20,
      });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.text(`Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    }

    return doc;
  } catch (e) {
    console.error('PDF generation failed:', e);
    return null;
  }
};

/**
 * Export to CSV
 */
export const exportToCSV = (filename, headers, rows) => {
  try {
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  } catch (e) {
    console.error('CSV export failed:', e);
    return false;
  }
};

/**
 * Export to Excel
 */
export const exportToExcel = (filename, sheets = {}) => {
  try {
    // Using a simple approach with XLSX-like format
    // In production, use library like `xlsx` or `exceljs`
    const csv = Object.entries(sheets).map(([name, { headers, rows }]) => {
      return [name, headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    }).join('\n\n');

    const blob = new Blob([csv], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  } catch (e) {
    console.error('Excel export failed:', e);
    return false;
  }
};

/**
 * Report Generator Component
 */
const ReportGenerator = ({ trips = [], drivers = [], onGenerated }) => {
  const [reportType, setReportType] = useState(REPORT_TYPES.TRIP_PERFORMANCE);
  const [timeRange, setTimeRange] = useState('7days');
  const [includeDetails, setIncludeDetails] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const reportContent = await aiGenerateReport(reportType, {
        trips: trips.slice(0, 50),
        drivers: drivers.slice(0, 20),
      }, timeRange);

      const doc = generatePDFReport(
        `${reportType.replace(/_/g, ' ').toUpperCase()} Report`,
        reportContent
      );

      if (doc) {
        doc.save(`${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);
        setGenerated(true);
        setTimeout(() => setGenerated(false), 3000);
        onGenerated && onGenerated();
      }
    } catch (e) {
      console.error('Report generation failed:', e);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl">
      <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
        <FileText size={24} className="text-blue-600" />
        Generate Report
      </h3>

      <div className="space-y-4">
        {/* Report Type */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          >
            {Object.entries(REPORT_TYPES).map(([key, value]) => (
              <option key={value} value={value}>
                {key.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Time Range */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Time Range</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="1year">Last year</option>
          </select>
        </div>

        {/* Options */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <input
            type="checkbox"
            id="details"
            checked={includeDetails}
            onChange={(e) => setIncludeDetails(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 cursor-pointer"
          />
          <label htmlFor="details" className="text-sm font-semibold text-slate-900 cursor-pointer">
            Include detailed breakdowns
          </label>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
            loading
              ? 'bg-slate-300 text-slate-700 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generating...
            </>
          ) : generated ? (
            <>
              <CheckCircle size={18} />
              Report Downloaded!
            </>
          ) : (
            <>
              <Download size={18} />
              Generate & Download PDF
            </>
          )}
        </button>
      </div>
    </div>
  );
};

/**
 * Quick Export Component
 */
const QuickExport = ({ data = {} }) => {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState('csv');

  const handleExport = async () => {
    setExporting(true);
    try {
      if (format === 'csv') {
        exportToCSV('agape_data.csv', data.headers || [], data.rows || []);
      } else if (format === 'excel') {
        exportToExcel('agape_data.xlsx', {
          Data: { headers: data.headers || [], rows: data.rows || [] },
        });
      } else if (format === 'json') {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'agape_data.json';
        link.click();
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(false);
  };

  return (
    <div className="flex gap-3">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="csv">CSV</option>
        <option value="excel">Excel</option>
        <option value="json">JSON</option>
      </select>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <Download size={16} />
        {exporting ? 'Exporting...' : 'Export'}
      </button>
    </div>
  );
};

/**
 * Custom Dashboard Builder
 */
const CustomDashboardBuilder = () => {
  const [widgets, setWidgets] = useState([
    { id: 1, type: 'kpi', title: 'Total Trips', metric: 'trips' },
    { id: 2, type: 'chart', title: 'Revenue Trend', metric: 'revenue' },
    { id: 3, type: 'table', title: 'Top Drivers', metric: 'drivers' },
  ]);
  const [layout, setLayout] = useState('grid'); // grid, list
  const [saved, setSaved] = useState(false);

  const availableMetrics = [
    { value: 'trips', label: '📦 Total Trips' },
    { value: 'revenue', label: '💰 Revenue' },
    { value: 'drivers', label: '👥 Drivers' },
    { value: 'satisfaction', label: '⭐ Satisfaction' },
    { value: 'efficiency', label: '⚡ Efficiency' },
    { value: 'compliance', label: '✅ Compliance' },
  ];

  const handleAddWidget = () => {
    const metric = availableMetrics[widgets.length % availableMetrics.length];
    setWidgets([...widgets, {
      id: Date.now(),
      type: 'kpi',
      title: metric.label.replace(/[^\w\s]/g, '').trim() || 'New Widget',
      metric: metric.value,
    }]);
    setSaved(false);
  };

  const handleEditWidget = (widget) => {
    const title = window.prompt('Widget title', widget.title);
    if (!title) return;
    setWidgets(widgets.map(item => item.id === widget.id ? { ...item, title } : item));
    setSaved(false);
  };

  const handleRemoveWidget = (widgetId) => {
    setWidgets(widgets.filter(widget => widget.id !== widgetId));
    setSaved(false);
  };

  const handleSaveDashboard = () => {
    localStorage.setItem('agape_custom_dashboard', JSON.stringify({ widgets, layout, savedAt: new Date().toISOString() }));
    setSaved(true);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <BarChart3 size={20} className="text-blue-600" />
        Custom Dashboard
      </h3>

      <div className="flex gap-3 mb-6">
        <select
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="grid">Grid Layout</option>
          <option value="list">List Layout</option>
        </select>
        <button onClick={handleAddWidget} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">
          + Add Widget
        </button>
      </div>

      <div className={`${layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-3 gap-4' : 'space-y-3'}`}>
        {widgets.map(widget => (
          <div key={widget.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:shadow-md transition-shadow">
            <p className="font-semibold text-slate-900">{widget.title}</p>
            <p className="text-xs text-slate-500 mt-1">Metric: {widget.metric}</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => handleEditWidget(widget)} className="text-xs font-bold text-blue-600 hover:underline">Edit</button>
              <button onClick={() => handleRemoveWidget(widget.id)} className="text-xs font-bold text-red-600 hover:underline">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleSaveDashboard} className="mt-6 w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors">
        {saved ? 'Dashboard Saved' : 'Save Dashboard'}
      </button>
    </div>
  );
};

/**
 * Main Reporting Page
 */
const ReportingModule = ({ trips = [], drivers = [] }) => {
  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-6">
        <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <BarChart3 size={32} className="text-blue-600" />
          Reports & Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-1">Generate reports, export data, and build custom dashboards</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report Generator */}
          <div className="lg:col-span-2">
            <ReportGenerator trips={trips} drivers={drivers} />
          </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <p className="text-sm font-semibold text-slate-600 mb-2">Quick Export</p>
              <QuickExport data={{
                headers: ['Trip ID', 'Driver', 'Status', 'Revenue'],
                rows: trips.slice(0, 5).map(t => [t.id, t.driverId, t.status, '$45']),
              }} />
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
              <p className="font-semibold text-slate-900">📊 Analytics Ready</p>
              <p className="text-sm text-slate-600 mt-2">Access AI-powered insights and trends in your dashboard</p>
              <button onClick={() => document.getElementById('custom-dashboard-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-3 text-sm font-bold text-blue-600 hover:underline">View Analytics →</button>
            </div>
          </div>
        </div>

        {/* Custom Dashboard */}
        <div id="custom-dashboard-builder">
          <CustomDashboardBuilder />
        </div>
      </div>
    </div>
  );
};

export default ReportingModule;
