import type {
  RegionGeometryStatus,
  TerrainRuntimeError,
  TerrainProviderStatus,
} from '../types/terrain';
import type { TerrainTarget } from './terrainTargets';

export interface TerrainState {
  mode: 'idle' | 'entering' | 'active' | 'exiting' | 'error';
  providerStatus: TerrainProviderStatus;
  geometryStatus: RegionGeometryStatus;
  sessionId: number | null;
  eventId: string | null;
  targets: TerrainTarget[];
  selectedTargetId: string | null;
  error: TerrainRuntimeError | null;
  overview: boolean;
  cameraRequestId: number;
  providerReady: boolean;
  sessionGeometryReady: boolean;
  overviewReady: boolean;
}

export type TerrainAction =
  | { type: 'OPEN'; sessionId: number; eventId: string; targets: TerrainTarget[] }
  | { type: 'OPEN_REJECTED'; sessionId: number; eventId: string; error: TerrainRuntimeError }
  | { type: 'ENTER_READY'; sessionId: number }
  | { type: 'PROVIDER_READY'; sessionId: number }
  | { type: 'SESSION_GEOMETRY_READY'; sessionId: number }
  | { type: 'ENTER_ERROR'; sessionId: number; error: TerrainRuntimeError }
  | { type: 'EXIT'; sessionId: number }
  | { type: 'EXIT_COMPLETE'; sessionId: number }
  | { type: 'REGION_GEOMETRY_LOADING' }
  | { type: 'REGION_GEOMETRY_READY' }
  | { type: 'REGION_GEOMETRY_ERROR'; error: TerrainRuntimeError }
  | { type: 'SELECT_TARGET'; sessionId: number; targetId: string }
  | { type: 'SHOW_OVERVIEW'; sessionId: number };

export const INITIAL_TERRAIN_STATE: TerrainState = {
  mode: 'idle',
  providerStatus: 'idle',
  geometryStatus: 'idle',
  sessionId: null,
  eventId: null,
  targets: [],
  selectedTargetId: null,
  error: null,
  overview: true,
  cameraRequestId: 0,
  providerReady: false,
  sessionGeometryReady: false,
  overviewReady: false,
};

function isCurrentSession(state: TerrainState, sessionId: number) {
  return state.sessionId === sessionId;
}

function activateIfReady(state: TerrainState): TerrainState {
  return state.mode === 'entering'
    && state.providerReady
    && state.sessionGeometryReady
    && state.overviewReady
    ? { ...state, mode: 'active', providerStatus: 'ready', error: null }
    : state;
}

export function terrainReducer(state: TerrainState, action: TerrainAction): TerrainState {
  switch (action.type) {
    case 'OPEN':
      return {
        mode: 'entering',
        providerStatus: 'loading',
        geometryStatus: state.geometryStatus,
        sessionId: action.sessionId,
        eventId: action.eventId,
        targets: action.targets,
        selectedTargetId: null,
        error: null,
        overview: true,
        cameraRequestId: state.cameraRequestId + 1,
        providerReady: false,
        sessionGeometryReady: false,
        overviewReady: false,
      };
    case 'OPEN_REJECTED':
      return {
        mode: 'error',
        providerStatus: 'idle',
        geometryStatus: state.geometryStatus,
        sessionId: action.sessionId,
        eventId: action.eventId,
        targets: [],
        selectedTargetId: null,
        error: action.error,
        overview: true,
        cameraRequestId: state.cameraRequestId + 1,
        providerReady: false,
        sessionGeometryReady: false,
        overviewReady: false,
      };
    case 'ENTER_READY':
      return isCurrentSession(state, action.sessionId) && state.mode === 'entering'
        ? activateIfReady({ ...state, overviewReady: true })
        : state;
    case 'PROVIDER_READY':
      return isCurrentSession(state, action.sessionId) && state.mode === 'entering'
        ? activateIfReady({ ...state, providerReady: true, providerStatus: 'ready' })
        : state;
    case 'SESSION_GEOMETRY_READY':
      return isCurrentSession(state, action.sessionId) && state.mode === 'entering'
        ? activateIfReady({ ...state, sessionGeometryReady: true })
        : state;
    case 'ENTER_ERROR':
      return isCurrentSession(state, action.sessionId) && state.mode === 'entering'
        ? { ...state, mode: 'error', providerStatus: 'error', error: action.error }
        : state;
    case 'EXIT':
      return isCurrentSession(state, action.sessionId) && state.mode !== 'idle'
        ? { ...state, mode: 'exiting' }
        : state;
    case 'EXIT_COMPLETE':
      return isCurrentSession(state, action.sessionId) && state.mode === 'exiting'
        ? {
          ...INITIAL_TERRAIN_STATE,
          geometryStatus: state.geometryStatus,
        }
        : state;
    case 'REGION_GEOMETRY_LOADING':
      return { ...state, geometryStatus: 'loading' };
    case 'REGION_GEOMETRY_READY':
      return { ...state, geometryStatus: 'ready' };
    case 'REGION_GEOMETRY_ERROR':
      return { ...state, geometryStatus: 'error' };
    case 'SELECT_TARGET':
      if (!isCurrentSession(state, action.sessionId) || state.mode !== 'active') return state;
      if (!state.targets.some((target) => target.id === action.targetId)) return state;
      return {
        ...state,
        selectedTargetId: action.targetId,
        overview: false,
        cameraRequestId: state.cameraRequestId + 1,
      };
    case 'SHOW_OVERVIEW':
      return isCurrentSession(state, action.sessionId) && state.mode === 'active'
        ? {
          ...state,
          selectedTargetId: null,
          overview: true,
          cameraRequestId: state.cameraRequestId + 1,
        }
        : state;
    default:
      return state;
  }
}
