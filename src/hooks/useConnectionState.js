/**
 * useConnectionState — React hook for enterprise connection monitoring.
 * 
 * Subscribes to the ConnectionMonitor state machine and NetworkQuality data.
 * Returns reactive values that update the UI in real time.
 */

import { useState, useEffect } from 'react';
import { connectionMonitor, ConnectionState } from '../utils/connectionMonitor';
import { networkQuality } from '../utils/networkQuality';

const STATE_COLORS = {
  [ConnectionState.CONNECTING]: { color: 'amber', label: 'Connecting...', dot: 'bg-amber-500 animate-pulse' },
  [ConnectionState.ONLINE]: { color: 'emerald', label: 'Live', dot: 'bg-emerald-500' },
  [ConnectionState.RECONNECTING]: { color: 'amber', label: 'Reconnecting...', dot: 'bg-amber-500 animate-pulse' },
  [ConnectionState.DEGRADED]: { color: 'orange', label: 'Slow', dot: 'bg-orange-500 animate-pulse' },
  [ConnectionState.OFFLINE]: { color: 'rose', label: 'Offline', dot: 'bg-rose-500 animate-pulse' },
  [ConnectionState.UNKNOWN]: { color: 'slate', label: 'Checking...', dot: 'bg-slate-400 animate-pulse' },
};

const QUALITY_COLORS = {
  fast: { color: 'emerald', label: 'Fast', icon: '📶' },
  medium: { color: 'amber', label: 'Good', icon: '📶' },
  slow: { color: 'rose', label: 'Slow', icon: '📶' },
  offline: { color: 'rose', label: 'Offline', icon: '🚫' },
  unknown: { color: 'slate', label: 'Unknown', icon: '❓' },
};

export function useConnectionState() {
  const [state, setState] = useState(() => connectionMonitor.getState());
  const [quality, setQuality] = useState(() => networkQuality.getQuality());

  useEffect(() => {
    const unsubConnection = connectionMonitor.subscribe((snapshot) => {
      setState({ state: snapshot.state, quality: snapshot.quality });
    });

    const unsubQuality = networkQuality.subscribe((snapshot) => {
      setQuality(snapshot);
    });

    return () => {
      unsubConnection();
      unsubQuality();
    };
  }, []);

  const connectionState = state.state || ConnectionState.UNKNOWN;
  const stateInfo = STATE_COLORS[connectionState] || STATE_COLORS[ConnectionState.UNKNOWN];
  const qualityInfo = QUALITY_COLORS[quality.quality] || QUALITY_COLORS.unknown;

  return {
    state: connectionState,
    stateLabel: stateInfo.label,
    stateColor: stateInfo.color,
    stateDot: stateInfo.dot,
    quality: quality.quality,
    qualityLabel: qualityInfo.label,
    qualityColor: qualityInfo.color,
    latencyMs: quality.latencyMs,
    effectiveType: quality.effectiveType,
    downlinkMbps: quality.downlinkMbps,
    isFlaky: quality.isFlaky || false,
    isOnline: quality.online,
    isOffline: connectionState === ConnectionState.OFFLINE,
    isDegraded: connectionState === ConnectionState.DEGRADED,
  };
}

/**
 * Format a timestamp as "Last synced X ago" relative to now.
 */
export function formatSyncAgo(timestampMs) {
  if (!timestampMs) return 'Never';
  const diff = Date.now() - timestampMs;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
