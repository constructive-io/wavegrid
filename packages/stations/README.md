# WaveGrid stations

Stations are off unless configured for a project. Fixture numbers are zero-based
logical layout indices, not output zones or receiver ranges.

```sh
wavegrid stations add north 0,2,4 "North"
wavegrid stations add south 1,3,5 "South"
wavegrid stations list
wavegrid keys new north-crewmember --station north
```

Restart the brain after editing fixture groups. Give the participant the Show URL
with `?station=north` and the one-time passcode separately. Desktop People &
Keys can also mint passcodes for configured stations. Re-mint a key with
`--station <slug>` to move its grant and revoke its old sessions.

The full-rig operator can select **mixed** (station paint overlays the running
show), **stations** (show hidden behind station output), or **show** (station
paint disabled). Stop and clear take precedence over station paint; enable
painting again using the mode selector. A participant's clear blacks out only
their station. Projectors support station color changes, not cue controls.

The brain registers the station module's message policy, scoped state projection,
and output compositor. Receivers apply the overlay after orientation and before
output sharding, keeping station membership tied to the configured fixture
indices. The receiver must be updated with the brain to display station paint.

This access control is not a substitute for venue laser-safety procedures or
hardware show-stop controls.
