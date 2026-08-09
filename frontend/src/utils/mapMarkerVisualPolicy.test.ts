import { describe, expect, it } from 'vitest';
import {
  effectiveSelectedMarkerId,
  markerInteractionState,
  markerRoleForEvent,
  resolveMapMarkerVisualStyle,
} from './mapMarkerVisualPolicy';

const categoryColor = '#9f1d2d';
const style = (role: 'atomic' | 'collection', state: 'default' | 'selected' | 'hovered' | 'dimmed') =>
  resolveMapMarkerVisualStyle({ role, state, categoryColor });

describe('map marker visual policy', () => {
  it('uses a solid atomic marker by default', () => {
    expect(style('atomic', 'default')).toMatchObject({ fillAlpha: 1, outlineColor: '#ffffff' });
  });

  it('uses a larger low-fill ring for a collection', () => {
    const collection = style('collection', 'default');
    expect(collection.fillAlpha).toBeGreaterThanOrEqual(0.12);
    expect(collection.fillAlpha).toBeLessThanOrEqual(0.2);
    expect(collection.outlineWidth).toBeGreaterThan(style('atomic', 'default').outlineWidth);
    expect(collection.pixelSize).toBeGreaterThan(style('atomic', 'default').pixelSize);
  });

  it('makes selected atomic and collection markers larger while preserving their roles', () => {
    expect(style('atomic', 'selected').pixelSize).toBeGreaterThan(style('atomic', 'default').pixelSize);
    expect(style('collection', 'selected').pixelSize).toBeGreaterThan(style('atomic', 'selected').pixelSize);
    expect(style('collection', 'selected').fillAlpha).toBeLessThan(style('atomic', 'selected').fillAlpha);
  });

  it('uses an opaque white selected outline and keeps the category color', () => {
    expect(style('atomic', 'selected')).toMatchObject({
      categoryColor,
      fillAlpha: 1,
      outlineColor: '#ffffff',
      outlineAlpha: 1,
      outlineWidth: 5,
    });
  });

  it('keeps dimmed markers visible at reduced alpha', () => {
    expect(style('atomic', 'dimmed').fillAlpha).toBeGreaterThan(0.4);
    expect(style('atomic', 'dimmed').fillAlpha).toBeLessThan(0.55);
    expect(style('collection', 'dimmed').fillAlpha).toBeGreaterThan(0);
  });

  it('gives selection priority over hover and only exposes selected or hovered labels', () => {
    expect(markerInteractionState('event', 'event', 'event')).toBe('selected');
    expect(markerInteractionState('hover', null, 'hover')).toBe('hovered');
    expect(style('atomic', 'default').labelVisible).toBe(false);
    expect(style('atomic', 'dimmed').labelVisible).toBe(false);
    expect(style('atomic', 'selected').labelVisible).toBe(true);
    expect(style('atomic', 'hovered').labelVisible).toBe(true);
  });

  it('uses the event-level contract and safely defaults legacy rows to atomic', () => {
    expect(markerRoleForEvent({ eventLevel: 'collection' })).toBe('collection');
    expect(markerRoleForEvent({ eventLevel: 'atomic' })).toBe('atomic');
    expect(markerRoleForEvent({ eventLevel: undefined })).toBe('atomic');
  });

  it('uses an effective selected marker only when the event has a rendered entity', () => {
    const markerIds = new Set(['marker-event']);
    expect(effectiveSelectedMarkerId('marker-event', markerIds)).toBe('marker-event');
    expect(markerInteractionState('marker-event', 'marker-event', null)).toBe('selected');
    expect(markerInteractionState('other-marker', 'marker-event', null)).toBe('dimmed');

    const noLocationSelected = effectiveSelectedMarkerId('no-location-event', markerIds);
    expect(noLocationSelected).toBeNull();
    expect(markerInteractionState('marker-event', noLocationSelected, null)).toBe('default');
    expect(resolveMapMarkerVisualStyle({
      role: 'atomic',
      state: 'default',
      categoryColor,
    })).toMatchObject({ labelVisible: false, fillAlpha: 1 });
  });

  it('restores defaults and re-enables selection across marker transitions and popup close', () => {
    const markerIds = new Set(['a', 'c']);
    const selectedA = effectiveSelectedMarkerId('a', markerIds);
    expect(markerInteractionState('a', selectedA, null)).toBe('selected');

    const selectedB = effectiveSelectedMarkerId('b', markerIds);
    expect(selectedB).toBeNull();
    expect(markerInteractionState('a', selectedB, null)).toBe('default');
    expect(markerInteractionState('c', selectedB, null)).toBe('default');

    const selectedC = effectiveSelectedMarkerId('c', markerIds);
    expect(markerInteractionState('c', selectedC, null)).toBe('selected');
    expect(markerInteractionState('a', selectedC, null)).toBe('dimmed');

    const closed = effectiveSelectedMarkerId(null, markerIds);
    expect(closed).toBeNull();
    expect(markerInteractionState('c', closed, null)).toBe('default');
  });
});
