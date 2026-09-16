import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Edit2, Save, X, Clock, User } from 'lucide-react';
import { designTokens } from '../../utils/designTokens';

const NotesSection = ({ trip, readOnly = false, onUpdate }) => {
  const tokens = designTokens;
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState(trip?.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNoteText(trip?.notes || '');
    setEditing(false);
  }, [trip?.notes]);

  const handleSave = async () => {
    if (!onUpdate || saving) return;
    setSaving(true);
    try {
      await onUpdate(trip.id, trip.status || 'Assigned', { 
        notes: noteText,
        workflowUpdatedAt: new Date().toISOString(),
      });
      setEditing(false);
    } catch (err) {
      console.error('[NotesSection] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasNotes = noteText && noteText.trim().length > 0;

  return (
    <div className={`rounded-2xl border overflow-hidden ${tokens.colors.background.secondary} ${tokens.elevation.sm}`}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <FileText size={18} className="text-slate-600" />
          </div>
          <h3 className="font-semibold text-slate-900">Notes</h3>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg ${tokens.typography.caption1} transition-colors touch-manipulation ${
              editing 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            } ${saving ? 'opacity-50' : ''}`}
          >
            {editing ? (saving ? 'Saving…' : 'Save') : 'Edit'}
          </button>
        )}
      </div>

      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none resize-y"
              placeholder="Add notes for this trip..."
              aria-label="Trip notes"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setNoteText(trip?.notes || ''); setEditing(false); }}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-sm touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : hasNotes ? (
          <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
            {noteText}
          </div>
        ) : !readOnly ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
              <FileText size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">No notes yet</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm touch-manipulation"
            >
              Add Notes
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <FileText size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notes</p>
          </div>
        )}
      </div>
    </div>
  );
};

export { NotesSection };
export default React.memo(NotesSection);