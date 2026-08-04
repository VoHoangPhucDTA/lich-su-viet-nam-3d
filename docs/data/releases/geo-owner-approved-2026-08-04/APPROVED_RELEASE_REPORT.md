# Phase B4-D — Owner-Approved Technical Geography Release

## Definition
This is an **owner-approved technical geography release** produced under the delegated fail-closed policy.
It is **not** a historically verified dataset, not a coordinate-accuracy certification, and not expert validation of every event.

## Release summary
- Records: 361
- GeoType counts: {'nationwide': 18, 'multi_polygon': 24, 'multi_point': 19, 'no_location': 254, 'point': 46}
- Renderable: 89, Non-renderable: 272
- Status counts: {'policy_auto_pass': 212, 'owner_policy_approved': 84, 'owner_approved_correction': 32, 'owner_approved_no_geometry': 33}
- Decision counts: {'DISABLE_GEOMETRY': 33, 'ACCEPT_POLICY': 23, 'SET_MULTI_POINT': 19, 'SET_POINT': 13}
- Boundary layer SHA: 54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f

## Audit results
- Identity/order errors: 0
- Non-geography diffs: 0
- Contract errors: 0
- GADM errors: 0
- Duplicate coordinates: 0
- Multi-point independence errors: 0
- showOnMap errors: 0
- Coordinate-order errors: 0
- Queue reconciliation: 87 → 88 (added 62 multi-point integrity events; see queue-count-reconciliation.json)

## Caveat
- Owner-approved technical fail-closed release: yes
- Expert historical verification claimed: no
- Full coordinate accuracy claimed: no
- Geometry is disabled where evidence is insufficient; historicalLocations may retain unrendered context.
- The map uses the project 63-province reference layer and does not represent current administrative boundaries.
