# Requirements Document

## Introduction

The haunt feature turns the attention signal (`present` or `away`, from the attention module) into escalating, varied, safe haunts. While the reader looks away, the room is haunted in steps up to level 3, and the effects build up instead of replacing each other. At the start of a look-away the engine picks a lead haunt, which differs from the lead haunt of the previous look-away. The lead haunt grows stronger at levels 1, 2 and 3. At level 3 a second haunt, the companion haunt, joins the lead. When the reader looks back, every effect fades out and the room returns to level 0. Each haunt is one file in `src/haunts/`. A single place in the engine enforces the sound and visual safety rules from the haunt-safety steering file, and applies them to the combined output of all running haunts, so no haunt or combination of haunts can bypass them.

At level 0 the reading view shows a calm, steady Candle_Glow around the Reading_Column, and the candle haunt dims and gutters that glow.

The first two haunts are: the candle dims and gutters, and whispers fade in from one side. The Ghost, defined in the ghost-dread spec, replaces the earlier shadow haunt; no shadow haunt is built. Every haunt supports levels 1 to 3 with increasing intensity.

The level logic is a pure function. The engine reads the attention signal through `subscribeSignal` and never touches the camera. Sounds are generated with the Web Audio API, with no audio files. Visual effects use CSS and SVG, drawn around the reading column and never over the active paragraph.

Assumptions:
- Both escalation thresholds (5 s and 12 s) are measured from the moment the signal turned `away`. Level 1 begins at 0 s, level 2 at 5 s, level 3 at 12 s.
- Escalation does not replace the running haunt. At level 2 and level 3 the engine raises the intensity of the running lead haunt. At level 3 the engine also starts a companion haunt that differs from the lead haunt, when at least two haunts are available.
- The lead haunt is chosen once per look-away, at the moment the signal turns `away`. The "no repeat" rule compares the lead haunts of consecutive look-aways.
- Total sound across all running haunts stays at or below the volume cap, and total flashing across all running haunts stays at or below 3 per second. The Safety_Gate enforces both on the combined output.
- Reduced-motion fades that last at least 1 s apply to fade-in only. Ambient effects finish fading out within 800 ms after the signal becomes `present` in every mode, including reduced motion. The Ghost of the ghost-dread spec may stay for its Return_Moment of at most 3000 ms after the signal becomes `present`.
- Haunt_Mode has exactly three values: Gentle, Classic (the default) and Nightmare. This spec's earlier Gentle_Mode is the Gentle value. Gentle limits haunts to level 1 with no Ghost figures, glitch effects or jumpscares.
- The temporary present/away label (`TempAttentionLabel`) is removed once haunts are wired into the reading view.
- The level-0 Candle_Glow is calm and steady. This is stricter than the "slow and subtle" ambient candle flicker in the visual design steering file: the glow may drift very slowly (at most 3 percent opacity change, no faster than one cycle per 8 s), and has no flicker at all under Reduced_Motion.
- The Volume_Cap is read from local storage if present, otherwise 0.4. This spec adds no control to change it. A later volume control or another browser tab may change the stored value, so the Safety_Gate still reacts to changes.
- The Camera_Consent_Dialog is defined by the attention-signal spec and implemented as the `ConsentDialog` component in `src/ui/ConsentDialog.tsx`, rendered by `AttentionLayer` in `src/ui/AttentionLayer.tsx` when the saved camera choice is `unanswered`. On the first session the reading view holds the dialog back until the Safety_Notice is dismissed. The attention module's camera logic and its rule that it alone touches the camera stay unchanged.
- Because no haunt changes the colour of the reading text or the background of the Reading_Column, the contrast of the existing theme stays unchanged, so this spec adds no contrast measurement.

## Glossary

- **Haunt_Engine**: The module that turns attention signal events and time into a haunt level, a lead haunt and a companion haunt, and starts, updates and stops haunts.
- **Level_Logic**: The pure function inside the Haunt_Engine that takes signal events, time, Haunt_Mode, the available haunts and the lead haunt of the previous look-away, and returns the haunt level, the lead haunt and the companion haunt. It has no DOM, audio, timer or camera access.
- **Attention_Signal**: The value emitted by the attention module through `subscribeSignal`: `present` or `away`, with a timestamp.
- **Haunt**: One module file in `src/haunts/` that exports an `id`, a `name`, a `start` function, a `setLevel` function and a `stop` function, and supports Haunt_Levels 1 to 3.
- **Haunt_Level**: An integer from 0 to 3. Level 0 is calm. Levels 1 to 3 are increasingly strong.
- **Intensity**: The strength of one Haunt's visual and sound output. Intensity increases with each Haunt_Level from 1 to 3.
- **Lead_Haunt**: The Haunt chosen at the start of a look-away. The Lead_Haunt runs from Haunt_Level 1 until the reader looks back, and its Intensity rises with the Haunt_Level.
- **Companion_Haunt**: The second Haunt that joins the Lead_Haunt at Haunt_Level 3. The Companion_Haunt has an `id` that differs from the `id` of the Lead_Haunt.
- **Haunt_Registry**: The part of the Haunt_Engine that finds all Haunt files in `src/haunts/`.
- **Safety_Gate**: The single place in the Haunt_Engine that enforces volume cap, sound fade-in, flash rate and reduced-motion rules on the combined output of all running Haunts. Haunts receive audio and visual output only through the Safety_Gate.
- **Volume_Cap**: The user's maximum output volume, between 0 and 1, read from local storage. The default is 0.4, used when the stored value is missing, unreadable, or outside 0 to 1. This spec provides no control to change it.
- **Candle_Glow**: The warm light drawn around the Reading_Column in the reading view. At Haunt_Level 0 it is calm and steady. The candle Haunt dims and gutters it.
- **Camera_Consent_Dialog**: The dialog from the attention-signal spec that explains why the camera is used and asks for permission. In the codebase it is the `ConsentDialog` component in `src/ui/ConsentDialog.tsx`, rendered by `AttentionLayer` in `src/ui/AttentionLayer.tsx`.
- **Haunt_Mode**: A saved setting with exactly three values: Gentle, Classic (the default) and Nightmare.
- **Gentle_Mode**: The Gentle value of the Haunt_Mode. It limits the Haunt_Level to 1 and allows no Ghost figures, glitch effects or jumpscares.
- **Return_Moment**: The period of at most 3000 ms after the Attention_Signal becomes `present`, defined in the ghost-dread spec, in which the Ghost and other return effects may remain.
- **Sound_Setting**: A saved setting that turns haunt and ambience sound on or off.
- **Reduced_Motion**: The browser preference `prefers-reduced-motion: reduce`.
- **Fade_Out**: The transition that brings every ambient haunt effect to zero Intensity after the signal becomes `present`. The Ghost is not an ambient effect and may stay for the Return_Moment.
- **Haunt_Control**: The small control in the top bar that toggles the Sound_Setting and sets the Haunt_Mode.
- **Safety_Notice**: The short photosensitivity and sound notice shown before the first reading session.
- **Audio_Unlock**: The first click or key press by the reader, after which the Haunt_Engine may produce sound.
- **Reading_Column**: The centred column holding the reading text, including the active paragraph. Haunt effects never change the computed `color` of the reading text or the computed `background-color` of the Reading_Column.

## Requirements

### Requirement 1: Escalate while the reader is away

**User Story:** As a reader who drifted away, I want the room to grow more haunted the longer I stay away, so that I am nudged back to the page.

#### Acceptance Criteria

1. WHEN the Attention_Signal becomes `away`, THE Haunt_Engine SHALL set the Haunt_Level to 1.
2. WHILE the Attention_Signal is `away` and 5 seconds have passed since the signal became `away`, THE Haunt_Engine SHALL set the Haunt_Level to at least 2.
3. WHILE the Attention_Signal is `away` and 12 seconds have passed since the signal became `away`, THE Haunt_Engine SHALL set the Haunt_Level to 3.
4. WHILE the Attention_Signal is `away`, THE Haunt_Engine SHALL keep the Haunt_Level at or below 3.
5. WHILE the Attention_Signal is `present`, THE Haunt_Engine SHALL keep the Haunt_Level from rising.
6. WHILE the Attention_Signal is `away`, THE Haunt_Engine SHALL keep the Haunt_Level from falling.
7. WHEN the Haunt_Level rises from 1 to 2 or from 2 to 3, THE Haunt_Engine SHALL raise the Intensity of the running Lead_Haunt to the Intensity of the new Haunt_Level without stopping the Lead_Haunt.

### Requirement 2: Retreat when the reader returns

**User Story:** As a reader, I want the haunting to retreat as soon as I look back, so that the page feels calm again.

#### Acceptance Criteria

1. WHEN the Attention_Signal becomes `present`, THE Haunt_Engine SHALL set the Haunt_Level to 0.
2. WHEN the Attention_Signal becomes `present`, THE Haunt_Engine SHALL complete the Fade_Out of every running ambient Haunt effect, including the Companion_Haunt, within 800 ms in every mode, including Reduced_Motion, and the Ghost MAY remain visible for the Return_Moment of at most 3000 ms after the Attention_Signal becomes `present`.
3. WHEN the Fade_Out completes, THE Haunt_Engine SHALL call the `stop` function of every Haunt that was started and not yet stopped, including the Lead_Haunt and the Companion_Haunt.
4. IF a Haunt `stop` function throws an error, THEN THE Haunt_Engine SHALL continue stopping the remaining Haunts and set the Haunt_Level to 0.
5. IF the Attention_Signal changes from `away` to `present` and back to `away`, THEN THE Haunt_Engine SHALL restart the escalation timing from the new `away` timestamp and choose a new Lead_Haunt.

### Requirement 3: Vary the haunts

**User Story:** As a reader, I want a different haunt to lead each time I drift, and a second haunt to join when I stay away, so that the haunting does not become predictable.

#### Acceptance Criteria

1. WHEN the Attention_Signal becomes `away` and more than one Haunt is available, THE Level_Logic SHALL choose a Lead_Haunt whose `id` differs from the `id` of the Lead_Haunt of the previous look-away.
2. IF only one Haunt is available, THEN THE Level_Logic SHALL choose that Haunt as the Lead_Haunt and choose no Companion_Haunt.
3. IF no Lead_Haunt exists for the previous look-away, THEN THE Level_Logic SHALL choose any available Haunt as the Lead_Haunt.
4. WHILE the Attention_Signal stays `away`, THE Haunt_Engine SHALL keep the same Lead_Haunt for the whole look-away.
5. WHEN the Haunt_Level becomes 3 and at least two Haunts are available, THE Level_Logic SHALL choose a Companion_Haunt whose `id` differs from the `id` of the Lead_Haunt, and THE Haunt_Engine SHALL start the Companion_Haunt while the Lead_Haunt keeps running.
6. WHILE the Haunt_Level is below 3, THE Level_Logic SHALL choose no Companion_Haunt.
7. IF no Haunt is available, THEN THE Haunt_Engine SHALL keep the Haunt_Level at 0 and report no error to the reader.

### Requirement 4: Haunt file contract

**User Story:** As a developer, I want each haunt to be one self-contained file with a fixed shape, so that I can add haunts without learning the engine.

#### Acceptance Criteria

1. THE Haunt SHALL be a single file in `src/haunts/` that exports `id`, `name`, a `start` function, a `setLevel` function and a `stop` function.
2. THE Haunt SHALL export an `id` that is unique across all Haunt files.
3. THE Haunt SHALL support every Haunt_Level from 1 to 3, with an Intensity that increases from level 1 to level 2 to level 3.
4. WHEN the Haunt_Engine calls `start`, THE Haunt SHALL receive the Haunt_Level, a Safety_Gate audio output and a Safety_Gate visual output, and no other path to the audio device or to the document.
5. WHEN the Haunt_Engine calls `setLevel` with a new Haunt_Level, THE Haunt SHALL change its Intensity to the Intensity of that Haunt_Level without stopping.
6. WHEN the Haunt_Engine calls `stop`, THE Haunt SHALL release every resource it created during `start`.
7. IF a Haunt file does not export every field of the Haunt contract, THEN THE Haunt_Registry SHALL exclude that file and log a warning that names the file.
8. IF two Haunt files export the same `id`, THEN THE Haunt_Registry SHALL keep the first file in path order, exclude the other, and log a warning that names both files.

### Requirement 5: Discover haunts automatically

**User Story:** As a developer, I want new haunt files to be found without editing the engine, so that adding a haunt is one file.

#### Acceptance Criteria

1. THE Haunt_Registry SHALL find Haunt files with a Vite `import.meta.glob` call over `src/haunts/*.ts`.
2. WHEN a new Haunt file is added to `src/haunts/` that satisfies the Haunt contract, THE Haunt_Registry SHALL include the Haunt in the set available to the Level_Logic without changes to any Haunt_Engine file.
3. THE Haunt_Registry SHALL exclude from the set of Haunts any file in `src/haunts/` that is a test file or a shared helper that is not a Haunt.
4. IF the `src/haunts/` directory contains no valid Haunt, THEN THE Haunt_Engine SHALL stay at Haunt_Level 0 and the reading view SHALL remain usable.

### Requirement 6: Enforce safety rules in one place

**User Story:** As a reader, I want every haunt, alone or combined with another, to be safe for my ears and eyes, so that I can read without fear of a harsh surprise.

#### Acceptance Criteria

1. THE Safety_Gate SHALL be the only code in the Haunt_Engine that applies the Volume_Cap, sound fade-in, flash-rate limit and Reduced_Motion rules.
2. THE Safety_Gate SHALL keep the combined output gain of all running Haunts at or below the Volume_Cap for every Haunt_Level and every combination of Lead_Haunt and Companion_Haunt.
3. WHEN a haunt sound starts, THE Safety_Gate SHALL raise the sound from zero gain to its target gain over at least 300 ms.
4. WHEN the Intensity of a running haunt sound rises, THE Safety_Gate SHALL raise the gain of that sound to the new target over at least 300 ms.
5. THE Safety_Gate SHALL limit the combined visual effects of all running Haunts to at most 3 brightness or opacity flashes per second.
6. IF the combined requested gain of the running Haunts exceeds the Volume_Cap, THEN THE Safety_Gate SHALL scale the gains down so that the combined gain equals the Volume_Cap.
7. IF the combined requested flash rate of the running Haunts exceeds 3 per second, THEN THE Safety_Gate SHALL reduce the flash rates so that the combined rate is at most 3 per second.
8. WHILE Reduced_Motion is on, THE Safety_Gate SHALL replace movement and flicker in every haunt visual effect with a fade, and every fade-in SHALL last at least 1000 ms.
9. WHILE Reduced_Motion is on, THE Safety_Gate SHALL complete every fade-out within 800 ms after the Attention_Signal becomes `present`.
10. WHILE Reduced_Motion is on, THE Safety_Gate SHALL emit no flashing effect.
11. OUTSIDE the Return_Moment, THE Safety_Gate SHALL keep every haunt visual effect outside the Reading_Column bounds, so that no effect covers the active paragraph. DURING the Return_Moment of at most 3000 ms, return effects, including the Evidence_Message, MAY cover or change the Reading_Column.
12. OUTSIDE the Return_Moment, THE Safety_Gate SHALL keep the computed `color` of the reading text and the computed `background-color` of the Reading_Column unchanged by every Haunt, at every Haunt_Level and for every combination of running Haunts. Within 100 ms after the Return_Moment ends, the Reading_Column SHALL be fully readable and identical in content and layout to its state before the Return_Moment.
13. WHEN the Volume_Cap changes while a haunt sound is playing, THE Safety_Gate SHALL apply the new cap to the combined output within 100 ms.
14. WHEN the reading view opens, THE Safety_Gate SHALL read the Volume_Cap from local storage.
15. IF the stored Volume_Cap is missing, unreadable, or outside 0 to 1, THEN THE Safety_Gate SHALL use a Volume_Cap of 0.4.
16. THE Haunt_Engine SHALL provide no control for changing the Volume_Cap.
17. IF a Haunt requests a gain above the Volume_Cap or a flash rate above 3 per second, THEN THE Safety_Gate SHALL reduce the request to the permitted limit.
18. THE Haunt_Engine SHALL generate every haunt sound with the Web Audio API and load no audio file.
19. THE Haunt_Engine SHALL produce no speech and no lyrics in any haunt sound.

### Requirement 7: Gentle mode

**User Story:** As a sensitive reader, I want a Gentle value of the Haunt_Mode, so that haunts stay subtle. Gentle limits haunts to level 1 with no Ghost figures, glitch effects or jumpscares.

#### Acceptance Criteria

1. WHERE the Haunt_Mode is Gentle, THE Level_Logic SHALL return a Haunt_Level of at most 1 and no Companion_Haunt for every sequence of Attention_Signal events and every elapsed time.
2. WHEN the Haunt_Mode is changed to Gentle while the Haunt_Level is above 1, THE Haunt_Engine SHALL lower the Intensity of the Lead_Haunt to the Intensity of level 1, fade out and stop the Companion_Haunt if one is running, and complete the transition within 800 ms in every mode, including Reduced_Motion.
3. WHEN the Haunt_Mode is changed from Gentle to Classic or Nightmare while the Attention_Signal is `away`, THE Haunt_Engine SHALL set the Haunt_Level from the time elapsed since the signal became `away`, using the thresholds in Requirement 1, keep the same Lead_Haunt, and start a Companion_Haunt if the resulting Haunt_Level is 3.
4. WHERE the Haunt_Mode is Gentle and the Attention_Signal is `present`, THE Haunt_Engine SHALL keep the Haunt_Level at 0.

### Requirement 8: Photosensitivity and sound notice, and audio unlock

**User Story:** As a reader, I want to be told about flashing and sound before I begin, and I want sound to stay off until I act, so that nothing startles me.

#### Acceptance Criteria

1. WHEN the reader opens the first reading session on this device, THE Haunt_Engine SHALL show the Safety_Notice before any haunt can start.
2. THE Safety_Notice SHALL state that haunts include dimming light, ghosts and glitching, that haunts include quiet sound, and that the reader can turn sound off or use Gentle_Mode. THE Safety_Notice SHALL contain no description of a moving shadow.
3. WHEN the reader dismisses the Safety_Notice, THE Haunt_Engine SHALL save that the notice was seen and not show it again on this device.
4. WHILE the Safety_Notice has not been dismissed, THE Haunt_Engine SHALL keep the Haunt_Level at 0.
5. WHILE the Audio_Unlock has not occurred, THE Haunt_Engine SHALL produce no sound.
6. WHEN the reader first clicks or presses a key, THE Haunt_Engine SHALL record the Audio_Unlock and allow sound.
7. WHILE the Audio_Unlock has not occurred and a Haunt starts, THE Haunt_Engine SHALL show the visual effect of that Haunt without sound.
8. THE Safety_Notice SHALL be operable with the keyboard alone.
9. WHILE the Safety_Notice is shown, THE reading view SHALL hold the Camera_Consent_Dialog back, so that the Safety_Notice and the Camera_Consent_Dialog are never shown at the same time.
10. WHEN the reader dismisses the Safety_Notice on the first session and the camera choice is unanswered, THE reading view SHALL allow the Camera_Consent_Dialog to show.
11. WHEN the reader opens a session after the Safety_Notice was dismissed on this device, THE reading view SHALL not show the Safety_Notice and SHALL show the Camera_Consent_Dialog only under the conditions of the attention-signal spec.
12. THE reading view SHALL hold back the Camera_Consent_Dialog without changing the camera logic of the attention module and without any Haunt_Engine access to the camera.

### Requirement 9: Sound and haunt-mode control

**User Story:** As a reader, I want a quick control for sound and the Haunt_Mode, so that I can adjust the haunting without a settings screen.

#### Acceptance Criteria

1. THE Haunt_Control SHALL appear in the top bar of the reading view.
2. WHEN the reader activates the sound toggle in the Haunt_Control, THE Haunt_Engine SHALL switch the Sound_Setting and stop all haunt sound within 300 ms when the setting becomes off.
3. WHEN the reader chooses a Haunt_Mode in the Haunt_Control, THE Haunt_Engine SHALL switch to that Haunt_Mode (Gentle, Classic or Nightmare).
4. WHEN the Sound_Setting or Haunt_Mode changes, THE Haunt_Engine SHALL save the new value locally.
5. WHEN the reading view opens, THE Haunt_Engine SHALL restore the saved Sound_Setting and Haunt_Mode.
6. IF the saved values are missing or unreadable, THEN THE Haunt_Engine SHALL use the defaults of Sound_Setting on and Haunt_Mode Classic.
7. THE Haunt_Control SHALL expose a text label and an on/off state for each toggle to screen readers.
8. THE Haunt_Control SHALL be operable with the keyboard alone and show a visible focus ring.

### Requirement 10: Level logic is a pure function

**User Story:** As a developer, I want the level logic to be a pure function, so that I can property-test it without a browser.

#### Acceptance Criteria

1. THE Level_Logic SHALL take signal events, the current time, Haunt_Mode, the list of available Haunts and the Lead_Haunt of the previous look-away as input, and return the Haunt_Level, the Lead_Haunt and the Companion_Haunt as output.
2. THE Level_Logic SHALL return the same output for the same input.
3. THE Level_Logic SHALL use no DOM, no audio, no camera, no timer and no global clock.
4. FOR ALL sequences of Attention_Signal events and times, THE Level_Logic SHALL return a Haunt_Level between 0 and 3.
5. FOR ALL sequences of Attention_Signal events and times with Haunt_Mode Gentle, THE Level_Logic SHALL return a Haunt_Level between 0 and 1 and no Companion_Haunt.
6. FOR ALL inputs in which the latest Attention_Signal is `present`, THE Level_Logic SHALL return a Haunt_Level of 0 and no Companion_Haunt.
7. FOR ALL consecutive inputs in which the Attention_Signal stays `present`, THE Level_Logic SHALL return a Haunt_Level that does not rise.
8. FOR ALL sequences of consecutive look-aways with two or more available Haunts, THE Level_Logic SHALL not choose the same Lead_Haunt `id` for two consecutive look-aways.
9. FOR ALL inputs with a Companion_Haunt, THE Level_Logic SHALL return a Haunt_Level of 3, two or more available Haunts, and a Companion_Haunt `id` that differs from the Lead_Haunt `id`.
10. FOR ALL inputs with exactly one available Haunt, THE Level_Logic SHALL return no Companion_Haunt.
11. FOR ALL Attention_Signal histories in which the signal is `away` and the elapsed away time grows, THE Level_Logic SHALL return a Haunt_Level that does not fall and the same Lead_Haunt.

### Requirement 11: Connect to the attention signal only

**User Story:** As a developer, I want the engine to depend only on the attention signal, so that the camera stays inside the attention module.

#### Acceptance Criteria

1. THE Haunt_Engine SHALL receive Attention_Signal values only through the `subscribeSignal` function of the attention module.
2. THE Haunt_Engine SHALL contain no import of camera, detector or video code.
3. WHEN the Haunt_Engine is stopped, THE Haunt_Engine SHALL unsubscribe from the Attention_Signal and stop every running Haunt, including the Lead_Haunt and the Companion_Haunt.
4. WHEN `subscribeSignal` delivers the current signal at subscription time, THE Haunt_Engine SHALL treat that value as the first signal event.
5. WHERE the camera is off and the attention module reports signals from tab-switch and idle detection, THE Haunt_Engine SHALL apply the same escalation and Fade_Out behaviour as for camera signals.

### Requirement 12: Calm candle glow at level 0

**User Story:** As a reader, I want a calm, steady candle glow around the page while I read, so that the room feels warm and the haunts have something to take away.

#### Acceptance Criteria

1. WHILE the reading view is open and the Haunt_Level is 0, THE reading view SHALL draw the Candle_Glow around the Reading_Column, using CSS or SVG.
2. THE reading view SHALL draw the Candle_Glow outside the Reading_Column bounds, so that the Candle_Glow does not cover the active paragraph.
3. WHILE the Haunt_Level is 0, THE Candle_Glow SHALL vary its opacity by at most 3 percent, over cycles of at least 8 seconds.
4. WHILE Reduced_Motion is on and the Haunt_Level is 0, THE Candle_Glow SHALL stay constant, with no flicker and no movement.
5. THE Candle_Glow SHALL leave the computed `color` of the reading text and the computed `background-color` of the Reading_Column unchanged (see Requirement 6, criterion 12).
6. WHEN the reading view closes, THE reading view SHALL remove the Candle_Glow from the document.

### Requirement 13: Candle haunt, dims and gutters

**User Story:** As a reader, I want the candle glow to dim and gutter more deeply the longer I look away, so that the room feels uneasy but still calm.

#### Acceptance Criteria

1. THE candle Haunt SHALL support Haunt_Levels 1, 2 and 3.
2. WHEN the candle Haunt runs at Haunt_Level 1, THE candle Haunt SHALL dim the Candle_Glow slightly, using CSS or SVG.
3. WHEN the candle Haunt runs at Haunt_Level 2, THE candle Haunt SHALL dim the Candle_Glow more deeply than at level 1 and add a slow gutter to the Candle_Glow.
4. WHEN the candle Haunt runs at Haunt_Level 3, THE candle Haunt SHALL dim the Candle_Glow more deeply than at level 2 and make the gutter larger, within the flash-rate limit of the Safety_Gate.
5. WHILE Reduced_Motion is on, THE candle Haunt SHALL dim the Candle_Glow with a fade-in of at least 1000 ms at every Haunt_Level and show no gutter movement.
6. WHEN the candle Haunt stops, THE candle Haunt SHALL restore the Candle_Glow to its level 0 appearance, and the Fade_Out SHALL complete within 800 ms in every mode, including Reduced_Motion.
7. THE candle Haunt SHALL produce no sound.

### Requirement 14: Whispers haunt, from one side

**User Story:** As a reader, I want faint whispers to drift in from one side and grow clearer the longer I look away, so that the haunting has a voice without words.

#### Acceptance Criteria

1. THE whispers Haunt SHALL support Haunt_Levels 1, 2 and 3.
2. WHEN the whispers Haunt starts, THE whispers Haunt SHALL generate filtered noise with the Web Audio API and pan it to one side of the stereo field.
3. WHEN the whispers Haunt runs at Haunt_Level 1, THE whispers Haunt SHALL play the noise at a very faint gain.
4. WHEN the whispers Haunt runs at Haunt_Level 2, THE whispers Haunt SHALL raise the gain of the noise above its level 1 gain.
5. WHEN the whispers Haunt runs at Haunt_Level 3, THE whispers Haunt SHALL raise the gain of the noise above its level 2 gain, within the combined Volume_Cap enforced by the Safety_Gate.
6. WHEN the whispers Haunt starts or its Intensity rises, THE whispers Haunt SHALL change the noise gain through the Safety_Gate.
7. WHEN the whispers Haunt stops, THE whispers Haunt SHALL disconnect and release every audio node it created.
8. WHILE the Sound_Setting is off or the Audio_Unlock has not occurred, THE whispers Haunt SHALL produce no sound and show a subtle edge vignette on the whisper side, with a stronger vignette at higher Haunt_Levels.
9. WHILE Reduced_Motion is on, THE whispers Haunt SHALL fade in the edge vignette over at least 1000 ms and fade it out within 800 ms.
10. THE whispers Haunt SHALL generate no speech and no lyrics.

### Requirement 15: The Ghost replaces the shadow haunt

**User Story:** As a developer, I want the shadow haunt removed from this spec, so that the Ghost of the ghost-dread spec is the only figure haunt.

#### Acceptance Criteria

1. THE haunt list of this spec SHALL contain the candle haunt and the whispers haunt only, and no shadow haunt file SHALL be built.
2. THE Ghost, as defined in the ghost-dread spec, SHALL take the place of the shadow haunt, and its Haunt_Mode rules apply (no Ghost figure in Gentle).

### Requirement 16: Reading view integration and cleanup

**User Story:** As a reader, I want the haunts to work inside the reading view and the temporary label to disappear, so that the page looks finished.

#### Acceptance Criteria

1. WHEN the reading view opens, THE Haunt_Engine SHALL subscribe to the Attention_Signal and start at Haunt_Level 0.
2. WHEN the reading view closes, THE Haunt_Engine SHALL stop all Haunts, including the Lead_Haunt and the Companion_Haunt, and unsubscribe from the Attention_Signal.
3. WHEN haunts are wired into the reading view, THE reading view SHALL remove the `TempAttentionLabel` component and its test.
4. OUTSIDE the Return_Moment, THE Haunt_Engine SHALL leave the Reading_Column, the active paragraph and reading controls unchanged in position and content at every Haunt_Level. During the Return_Moment of at most 3000 ms, return effects MAY cover or change the Reading_Column, and within 100 ms after it ends the Reading_Column SHALL be identical in content and layout to its state before the Return_Moment.
5. WHILE the Haunt_Level is above 0, THE reading view SHALL keep keyboard use of the reading flow working.
6. THE Haunt_Engine SHALL send no data over the network.
7. THE Haunt_Engine SHALL store no video frame and no camera data.
