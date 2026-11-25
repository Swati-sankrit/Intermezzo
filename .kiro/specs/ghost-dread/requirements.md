# Requirements Document

## Introduction

Ghost-dread makes looking away frightening, so readers stay with the page. While the reader is away, a Ghost appears and stands closer with each look-away in the chapter, and positioned 3D sound moves around the listener. When the reader returns, a Return_Moment of at most 3 seconds plays: the room calms, the Ghost lingers and fades, a Glitch may tear the page, evidence of the haunting may appear, and after a long absence a Jumpscare may occur. After a very long absence, the Spoiler_Threat shows a blurred sentence from the final chapter of the book. Three Haunt_Modes (Gentle, Classic, Nightmare) control how strong all of this is. Optionally, the Ghost's messages mention names from the book.

Every effect passes through the existing Safety_Gate and haunt engine from the haunt-feature spec. The decisions about when each effect may happen are pure functions with no DOM, audio, timer or camera access, so they can be property-tested. The Ghost and Jumpscare art is drawn in code (SVG, canvas, CSS filters), with no image files. The shadow haunt of the haunt-feature spec is not built; the Ghost replaces it.

Assumptions:
- The Ghost is not a figure of a real person or group, and has no gore. The Ghost's glowing eyes are faint and never flash.
- Ghost figures, Glitch and Jumpscares are allowed only in Classic and Nightmare, as the haunt-safety rules state. In Gentle, the haunt-feature level 1 behaviour (the candle dim) is the only effect.
- A Look_Away starts when the Attention_Signal becomes `away` and ends when it becomes `present`. The Away_Duration is the time between the two.
- The escalation levels and thresholds (level 1 at 0 s, level 2 at 5 s, level 3 at 12 s) stay as in haunt-feature. "High levels" means level 3.
- Qualifying_Return means a return after an Away_Duration of at least 10 seconds in Classic or Nightmare.
- Jumpscare frequency is bounded over any three consecutive Qualifying_Returns: at most 1 Jumpscare in Classic and at most 2 in Nightmare. Within the bound, a random roll decides each Jumpscare.
- Ghost_Distance has 5 steps, from step 0 (farthest) to step 4 (closest). Each Look_Away in the same chapter moves the Ghost one step closer, up to step 4. The first Look_Away of a chapter starts at step 0.
- The Breach_Time is 20 seconds. The Reveal_Time is 60 seconds. Both are constants in this spec, with no control to change them.
- The Spoiler_Threat card has no Ghost figure. The Ghost figure holds the card only during the Return_Moment, and the card stays after the Return_Moment ends until the reader dismisses it or 10 seconds pass, but only when the free space beside the Reading_Column is at least 160 px wide. In that case, after the Return_Moment, the card sits beside the Reading_Column and never covers the active paragraph. When the free space is under 160 px wide, the card is shown only during the Return_Moment, may cover the text then like other Return_Moment effects, and is hidden when the Return_Moment ends. In both cases the reader can dismiss the card at any time (button or Escape key), including while the Ghost holds it. This needs a small amendment to the "ghost lingers at most 3 seconds" rule, which applies to the Ghost figure only. `.kiro/steering/haunt-safety.md` contains notes for this card placement and dismissal rule and for the pulse rule below.
- Individual sound pulses inside an already running sound layer (a footstep, a knock, a breath) use an attack of at least 20 ms and never exceed the layer's current gain target, which stays at or below the Volume_Cap. The layer itself starts through the Safety_Gate fade-in of at least 300 ms. Only a Jump_Sound may start with a faster layer attack, and only with an attack of at least 20 ms.
- The Evidence_Message replaces consecutive words of the active paragraph only during the Return_Moment, and the paragraph is restored to its exact original text before the Return_Moment ends.
- If the book has no chapter structure, has only one chapter, or the reader is in the final chapter, no Spoiler_Threat is shown, because there is no earlier-read text to protect.
- The Gentle toggle becomes a three-way Haunt_Mode. A saved "gentle on" becomes Gentle and a saved "gentle off" becomes Classic.

## Glossary

- **Haunt_Engine**: The existing module from the haunt-feature spec that turns the Attention_Signal into a Haunt_Level, a lead haunt and a companion haunt, and starts, updates and stops haunts.
- **Safety_Gate**: The existing single place in the Haunt_Engine that enforces volume cap, sound fade-in, flash rate and Reduced_Motion rules on the combined output of all running haunts (`src/haunts/engine/gate/gate.ts`).
- **Restricted_Audio_Context**: The wrapper audio context that a haunt receives from the Safety_Gate. It has no `destination` and no raw `AudioContext`.
- **Attention_Signal**: The value `present` or `away`, with a timestamp, emitted through `subscribeSignal`.
- **Haunt_Level**: An integer from 0 to 3 chosen by the Haunt_Engine.
- **Haunt_Mode**: One of Gentle, Classic or Nightmare. Classic is the default.
- **Gentle**: The Haunt_Mode that limits haunts to Haunt_Level 1, with no Ghost, no Glitch, no Jumpscare and no Spoiler_Threat.
- **Classic**: The default Haunt_Mode, with a Ghost, Glitch, Jumpscares at the Classic frequency, and a Spoiler_Threat that never becomes fully legible.
- **Nightmare**: The Haunt_Mode with a Ghost, Glitch, more frequent Jumpscares, and a Spoiler_Threat that a very long absence can reveal.
- **Look_Away**: The period from the Attention_Signal turning `away` to it turning `present`.
- **Away_Duration**: The length of a Look_Away in milliseconds.
- **Return_Moment**: The period after the Attention_Signal becomes `present` after a Look_Away, lasting at most 3 seconds, in which the Ghost lingers, Glitch, Evidence_Message and Jumpscare may occur.
- **Return_Planner**: The pure function that takes the Haunt_Mode, Away_Duration, history of earlier returns, random rolls, Reduced_Motion and the paragraph, and returns the plan for one Return_Moment.
- **Ghost**: An original drawn figure, a silhouette with faint glowing eyes, drawn with SVG or canvas.
- **Ghost_Distance**: The step from 0 (farthest) to 4 (closest) at which the Ghost stands, set by the count of Look_Aways in the current chapter.
- **Ghost_Figure_Layer**: The visual layer that draws the Ghost outside the Reading_Column while the reader is away.
- **Spatial_Sound**: Sound positioned around the listener with a PannerNode using the HRTF panning model.
- **Footsteps_Layer**: The Spatial_Sound layer of footsteps that approach and circle the listener.
- **Breathing_Layer**: The Spatial_Sound layer of breathing placed near one ear.
- **Knock_Layer**: The Spatial_Sound layer that plays a single knock at Haunt_Level 3.
- **Jumpscare**: A sudden Ghost close-up with a Jump_Sound, played only in a Return_Moment.
- **False_Calm**: A pause of 0.3 to 0.8 seconds, at the start of the Return_Moment, before a Jumpscare.
- **Jump_Sound**: The sharp sound of a Jumpscare, with an attack of at least 20 ms and a gain at or below the Volume_Cap.
- **Qualifying_Return**: A return after an Away_Duration of at least 10 seconds in Classic or Nightmare.
- **Glitch**: A page effect of tearing, colour-channel shift and brief flicker, lasting under 1 second.
- **Evidence_Message**: A short message, such as "I was here", that replaces consecutive words of the active paragraph during the Return_Moment.
- **Spoiler_Threat**: A card, shown after a return with an Away_Duration longer than the Breach_Time, that holds a blurred sentence from the final chapter.
- **Breach_Time**: The Away_Duration of 20 seconds beyond which the Spoiler_Threat is shown.
- **Reveal_Time**: The Away_Duration of 60 seconds at which the Spoiler_Threat can become fully legible in Nightmare.
- **Legibility**: A number from 0 (fully blurred) to 1 (fully legible) for the Spoiler_Threat sentence.
- **Final_Chapter**: The last chapter of the current book.
- **Reading_Column**: The centred column holding the reading text, including the active paragraph.
- **Reduced_Motion**: The browser preference `prefers-reduced-motion: reduce`.
- **Volume_Cap**: The user's maximum output volume, between 0 and 1, enforced in the Safety_Gate.
- **Safety_Notice**: The notice shown before the first reading session.
- **Haunt_Control**: The control in the top bar for the Sound_Setting and the Haunt_Mode.
- **Taunt_Builder**: The pure functions that pick Name_Candidates and fill Taunt_Templates.
- **Name_Candidate**: A capitalised word in the text read so far that is not the first word of a sentence and is not in the common-word list.
- **Taunt_Template**: An original sentence with a `{name}` slot, or a Name_Free_Template without a slot.
- **Name_Free_Template**: An original taunt sentence with no `{name}` slot.
- **Reading_Position**: The position of the active paragraph in the book.
- **Ghost_Asset**: An image file, PNG or WebP, in `public/ghosts/`, listed in the Asset_Allowlist.
- **Asset_Allowlist**: The fixed, hard-coded list of exact Ghost_Asset and Haunt_Sound file names the application may load. No other file name may be requested.
- **Haunt_Sound**: A recorded MP3 file in `public/sounds/`, listed in the Asset_Allowlist, decoded into an audio buffer and played by a haunt through the Restricted_Audio_Context.
- **Asset_Loader**: The module that fetches a Ghost_Asset or Haunt_Sound by same-origin relative URL, decodes it, and caches the result, falling back when the fetch, the decode, or the image load fails.
- **Image_Layer**: A VisualLayer extension that can show one Ghost_Asset at a given opacity, scale, and position, in place of or alongside SVG markup.
- **Rim_Glow**: A faint pale outline drawn around the Ghost silhouette so the dark figure reads against the dark background, using a theme colour.
- **Smoke_Entrance**: A brief, theme-coloured, blurred-shape animation that plays just before the Ghost image fades in.
- **Red_Coverage**: The share of on-screen pixels, at a given scale, that fall within the saturated-red colour band used for the Ghost's eyes.
- **Mix**: The set of rules governing which sound layers play together, at what relative loudness, in each Haunt_Mode.
- **Continuous_Layer**: A Haunt_Sound layer that plays without gaps while it runs (for example a drone).
- **Event_Sound**: A Haunt_Sound that plays as a discrete occurrence rather than continuously (footsteps, breathing, knock, heartbeat, creak).
- **Event_Headroom**: The minimum gap, in decibels, between an Event_Sound's peak level and the combined level of all Continuous_Layers playing at the same instant.

## Requirements

### Requirement 1: Spatial sound while away

**User Story:** As a reader who drifted away, I want sound that seems to move around me, so that looking away feels frightening.

#### Acceptance Criteria

1. WHILE the Attention_Signal is `away` and the Haunt_Mode is Classic or Nightmare and the Haunt_Level is 1 or higher, THE Haunt_Engine SHALL play a Footsteps_Layer whose source distance from the listener never increases as the Haunt_Level rises, and whose source azimuth moves around the listener at a rate that rises with the Haunt_Level.
2. WHILE the Attention_Signal is `away` and the Haunt_Mode is Classic or Nightmare and the Haunt_Level is 1 or higher, THE Haunt_Engine SHALL play a Breathing_Layer whose source sits within 1 metre of the listener, at an azimuth between 60° and 120° to one side, and keeps that side for the whole Look_Away.
3. WHEN the Haunt_Level becomes 3 while the Attention_Signal is `away` and the Haunt_Mode is Classic or Nightmare, THE Haunt_Engine SHALL play exactly one knock in the Knock_Layer within 500 ms, and SHALL play no further knock during that Look_Away.
4. THE Haunt_Engine SHALL generate every Spatial_Sound with the Web Audio API, load no audio file, and make no network request for audio.
5. THE Haunt_Engine SHALL position every Spatial_Sound with a PannerNode that uses the HRTF panning model.
6. THE Restricted_Audio_Context SHALL provide a panner wrapper that connects only to other wrappers and to the port input, so that every Spatial_Sound path to the speakers passes through the Safety_Gate.
7. THE Safety_Gate SHALL keep the combined gain of all Spatial_Sound layers and all other running haunts at or below the Volume_Cap at every instant.
8. WHEN a Spatial_Sound layer starts, THE Safety_Gate SHALL raise that layer from zero gain to its target gain over at least 300 ms.
9. THE Haunt_Engine SHALL give every individual pulse inside a running layer (a footstep, a breath, the knock) an attack of at least 20 ms, and SHALL keep the peak of every pulse at or below the layer's current gain target, with that gain target at or below the Volume_Cap.
10. THE Haunt_Engine SHALL produce no speech and no lyrics in any Spatial_Sound.
11. WHILE the Sound_Setting is off or the Audio_Unlock has not occurred, THE Haunt_Engine SHALL produce no Spatial_Sound and SHALL still show the Ghost at the current Haunt_Level where the Haunt_Mode allows a Ghost.
12. WHEN the Attention_Signal becomes `present`, THE Haunt_Engine SHALL fade every Spatial_Sound layer from its current gain to zero within 800 ms in every Haunt_Mode, including Reduced_Motion.
13. WHEN a Spatial_Sound layer stops, THE Haunt_Engine SHALL disconnect and release every audio node the layer created within 1000 ms of the layer's gain reaching zero.
14. WHERE the Haunt_Mode is Gentle, THE Haunt_Engine SHALL play no Footsteps_Layer, no Breathing_Layer and no Knock_Layer.
15. IF the audio context cannot be created or cannot be resumed, THEN THE Haunt_Engine SHALL produce no Spatial_Sound, SHALL continue to show the Ghost and the visual haunt effects, and SHALL show no error message to the reader during reading.
16. IF the Attention_Signal becomes `present` while a Spatial_Sound layer is still fading in, THEN THE Haunt_Engine SHALL start the fade-out from that layer's current gain without a step increase in gain.

### Requirement 2: The Ghost appears while away

**User Story:** As a reader, I want a ghost to stand closer each time I look away, so that I feel the cost of drifting.

#### Acceptance Criteria

1. WHILE the Attention_Signal is `away` AND the Haunt_Mode is Classic or Nightmare, THE Ghost_Figure_Layer SHALL draw the Ghost as an original silhouette with faint glowing eyes, using SVG or canvas.
2. WHILE the Attention_Signal is `away` AND the Haunt_Mode is Classic or Nightmare, THE Ghost_Figure_Layer SHALL keep every drawn pixel of the Ghost outside the Reading_Column bounds.
3. WHEN a Look_Away starts, THE Haunt_Engine SHALL set the Ghost_Distance to the number of earlier Look_Aways in the current chapter, capped at step 4 (the first Look_Away of a chapter is step 0, the fifth and later Look_Aways are step 4).
4. WHEN the reader moves to a different chapter, THE Haunt_Engine SHALL reset the count of Look_Aways to 0, so that the next Look_Away starts at step 0.
5. THE Haunt_Engine SHALL keep the Ghost_Distance as an integer from 0 to 4 inclusive for every count of Look_Aways, including counts above 4.
6. WHEN the Ghost_Distance increases by one step, THE Ghost_Figure_Layer SHALL draw the Ghost with a larger rendered height and with more drawn detail elements than at the previous step, with each step differing from the previous one.
7. THE Ghost_Figure_Layer SHALL draw the Ghost with no face of a real person, no figure of a real group and no gore, and SHALL load no image file.
8. WHILE the Ghost is drawn, THE Ghost_Figure_Layer SHALL keep the Ghost's glowing eyes at a constant brightness, with no change in brightness over time.
9. WHILE Reduced_Motion is on, THE Ghost_Figure_Layer SHALL fade the Ghost in over at least 1000 ms and SHALL keep the Ghost's position unchanged during and after the fade.
10. WHERE the Haunt_Mode is Gentle, THE Ghost_Figure_Layer SHALL draw no Ghost and SHALL add no Ghost elements to the document.
11. WHEN the Ghost_Figure_Layer is stopped, THE Ghost_Figure_Layer SHALL remove all of its elements from the document, leaving zero Ghost_Figure_Layer elements in the document.
12. WHILE the Ghost is drawn, THE Ghost_Figure_Layer SHALL expose a text label for screen readers that says a ghost stands nearby, and SHALL keep keyboard focus on the element that held it before the Ghost was drawn.
13. WHEN the Attention_Signal changes to `present` AND the Return_Moment has ended (at most 3000 ms after the change), THE Ghost_Figure_Layer SHALL remove the Ghost from view so that the Reading_Column text is fully readable.

### Requirement 3: The Return_Moment

**User Story:** As a reader coming back, I want the room to calm quickly while the ghost lingers briefly, so that I can read again.

#### Acceptance Criteria

1. WHEN the Attention_Signal becomes `present` after a Look_Away while the Haunt_Mode is Classic or Nightmare, THE Haunt_Engine SHALL start a Return_Moment within 100 ms of the signal.
2. THE Return_Planner SHALL return a Return_Moment whose total duration, including any False_Calm, Jumpscare and a Glitch that starts after the Jumpscare ends, is greater than 0 ms and at most 3000 ms.
3. WHEN the Return_Moment starts, THE Haunt_Engine SHALL fade the ambient effects (the candle dim, the Spatial_Sound layers and the whispers) to zero intensity within 800 ms in every mode.
4. WHILE the Return_Moment is running, THE Ghost_Figure_Layer SHALL keep the Ghost visible, and the Ghost MAY cover the Reading_Column.
5. WHEN the Return_Moment ends, THE Ghost_Figure_Layer SHALL fade the Ghost out and remove all Ghost elements from the page, and THE Haunt_Engine SHALL leave the reading text at full opacity with no overlay or effect on it.
6. WHEN the Return_Moment ends, THE Haunt_Engine SHALL set the Haunt_Level to 0.
7. IF the Attention_Signal becomes `away` during a Return_Moment, THEN THE Haunt_Engine SHALL end the Return_Moment within 100 ms, restore the paragraph text to full opacity, remove all Ghost elements, and start a new Look_Away.
8. WHILE the Return_Moment is running, THE Haunt_Engine SHALL leave the reading controls operable, keep keyboard input working, and keep the Reading_Column at the same screen position (0 px shift).
9. WHERE the Haunt_Mode is Gentle, WHEN the Attention_Signal becomes `present` after a Look_Away, THE Haunt_Engine SHALL start no Return_Moment and SHALL fade the candle dim to zero intensity within 800 ms.
10. WHILE Reduced_Motion is on, THE Haunt_Engine SHALL replace all movement and flicker in the Return_Moment with a fade lasting at least 500 ms, and SHALL emit no Jumpscare close-up or Glitch (the Jumpscare slow fade of requirement 5 criterion 12 still applies).
11. IF the Haunt_Mode changes during a Return_Moment, THEN THE Haunt_Engine SHALL let the running Return_Moment finish within its original duration and apply the new mode from the next Look_Away, except that a change to Gentle follows requirement 8 criterion 10.

### Requirement 4: Evidence of the haunting

**User Story:** As a reader, I want to find a trace of the ghost on the page after I return, so that the haunting feels real.

#### Acceptance Criteria

1. WHERE the Haunt_Mode is Classic or Nightmare, WHEN a Return_Moment starts and the active paragraph has at least as many words as the Evidence_Message, THE Return_Planner MAY choose one Evidence_Message and one run of consecutive words of the active paragraph to replace, where a word is a maximal sequence of non-whitespace characters.
2. THE Return_Planner SHALL choose a run whose word count equals the word count of the Evidence_Message.
3. IF the active paragraph has fewer words than the Evidence_Message, THEN THE Return_Planner SHALL choose no Evidence_Message and THE Haunt_Engine SHALL leave the paragraph text unchanged.
4. WHILE the Evidence_Message is shown, THE Haunt_Engine SHALL keep the whitespace, punctuation and every word outside the chosen run unchanged, character for character.
5. WHEN the Evidence_Message has been shown for its duration, THE Haunt_Engine SHALL restore the paragraph so that the restored text equals the original text exactly, character for character.
6. THE Haunt_Engine SHALL show each Evidence_Message for no more than 1500 ms and SHALL restore the paragraph before the Return_Moment ends, which is at most 3000 ms after the reader returns.
7. IF the Return_Moment ends before the Evidence_Message duration has elapsed, THEN THE Haunt_Engine SHALL restore the paragraph at the moment the Return_Moment ends.
8. THE Haunt_Engine SHALL leave all stored book text and all saved reading progress unchanged when it shows, restores or abandons an Evidence_Message.
9. WHILE the Evidence_Message is shown, THE Haunt_Engine SHALL leave the computed `color` of the reading text unchanged, so the text keeps WCAG AA contrast (at least 4.5:1) against the background.
10. WHILE Reduced_Motion is on, THE Haunt_Engine SHALL show and remove the Evidence_Message with a fade and no movement and no flicker.
11. WHILE the Evidence_Message is shown, THE Haunt_Engine SHALL keep the original, unreplaced paragraph text available to screen readers and SHALL NOT announce the Evidence_Message text to screen readers.
12. WHERE the Haunt_Mode is Gentle, THE Haunt_Engine SHALL show no Evidence_Message.

### Requirement 5: Jumpscare decisions

**User Story:** As a reader who chose a scary mode, I want an occasional unpredictable jumpscare after a long absence, so that I fear drifting for long.

#### Acceptance Criteria

1. IF a Return_Moment is not a Qualifying_Return, THEN THE Return_Planner SHALL plan no Jumpscare for that Return_Moment.
2. IF the Haunt_Mode is Gentle, THEN THE Return_Planner SHALL plan no Jumpscare.
3. IF the Attention_Signal is `present` and no Look_Away has ended within the current Return_Moment, THEN THE Haunt_Engine SHALL start no Jumpscare.
4. THE Return_Planner SHALL plan at most one Jumpscare per Return_Moment.
5. WHERE the Haunt_Mode is Classic, THE Return_Planner SHALL plan at most 1 Jumpscare in any 3 consecutive Qualifying_Returns.
6. WHERE the Haunt_Mode is Nightmare, THE Return_Planner SHALL plan at most 2 Jumpscares in any 3 consecutive Qualifying_Returns.
7. WHERE the Haunt_Mode is Nightmare, THE Return_Planner SHALL use a Jumpscare probability per Qualifying_Return that is strictly higher than the Classic probability, while both stay within the limits in criteria 5 and 6.
8. WHEN the Return_Planner plans a Jumpscare, THE Return_Planner MAY plan a False_Calm of 0.3 to 0.8 seconds before the Jumpscare, and the False_Calm duration plus the Jumpscare duration SHALL NOT exceed the 3000 ms Return_Moment, and the Glitch of requirement 6 criterion 1 starts only after the Jumpscare ends.
9. WHEN the Jumpscare starts, THE Ghost_Figure_Layer SHALL draw a sudden Ghost close-up drawn in code (SVG, canvas or CSS filters) that contains no full-screen saturated red fill.
10. WHEN the Jumpscare starts, THE Safety_Gate SHALL play the Jump_Sound through a jump-sound channel with an attack of at least 20 ms and a peak gain at or below the Volume_Cap.
11. IF a jump-sound channel is requested while no Return_Moment is running, THEN THE Safety_Gate SHALL reject the channel and play no sound.
12. WHILE Reduced_Motion is on, THE Haunt_Engine SHALL replace the Jumpscare close-up with a fade lasting at least 1000 ms, with no sudden movement and no flicker.
13. WHEN the Jumpscare ends, THE Haunt_Engine SHALL release the jump-sound channel and every audio node it created, and the Jumpscare SHALL end no later than the end of the 3000 ms Return_Moment.
14. IF the Sound_Setting is off or the Audio_Unlock has not occurred, THEN THE Haunt_Engine SHALL show the Jumpscare close-up without sound.

### Requirement 6: Glitch at the return

**User Story:** As a reader, I want the page to tear for a moment when I return, so that the haunting feels like it touched the page.

#### Acceptance Criteria

1. WHEN a Return_Moment starts AND the Haunt_Mode is Classic or Nightmare AND Reduced_Motion is off, THE Haunt_Engine SHALL show a Glitch on the page that combines horizontal tearing, a colour-channel shift and at least 1 flicker, starting at the beginning of the Return_Moment when the Return_Planner planned no Jumpscare, and starting after the Jumpscare ends when the Return_Planner planned a Jumpscare, so that the False_Calm stays calm and the Glitch and the Jumpscare do not overlap.
   - IF the Glitch would not end within the 3000 ms Return_Moment, THEN THE Return_Planner SHALL plan no Glitch for that Return_Moment.
2. THE Return_Planner SHALL plan each Glitch with a duration of at least 100 ms and under 1000 ms.
3. THE Return_Planner SHALL plan at most 3 flickers in any 1000 ms window of the Glitch.
4. THE Safety_Gate SHALL count the Glitch flickers together with the flashes of all other running effects, and THE Safety_Gate SHALL keep the combined flash rate at or below 3 per second in every 1000 ms window.
5. IF a planned Glitch would raise the combined flash rate above 3 per second in any 1000 ms window, THEN THE Safety_Gate SHALL reject the excess flickers and THE Haunt_Engine SHALL show the Glitch with only the flickers the Safety_Gate allows.
6. THE Haunt_Engine SHALL draw the Glitch without any full-screen area of saturated red.
7. WHILE Reduced_Motion is on, THE Haunt_Engine SHALL replace the Glitch with a single opacity fade that has no tearing, no colour shift and no flicker.
8. WHEN the Glitch ends, THE Haunt_Engine SHALL remove every Glitch element and Glitch filter from the document within 100 ms.
9. IF no Return_Moment is active, THEN THE Haunt_Engine SHALL show no Glitch.
10. WHERE the Haunt_Mode is Gentle, THE Haunt_Engine SHALL show no Glitch.
11. WHILE the Glitch is shown, THE Haunt_Engine SHALL leave the text content of the page identical to its content before the Glitch started.

### Requirement 7: Spoiler threat

**User Story:** As a reader who stayed away too long, I want a blurred sentence from the end of the book dangled at me, so that I fear what a long absence could cost.

#### Acceptance Criteria

1. WHERE the Haunt_Mode is Classic or Nightmare, WHEN the Attention_Signal becomes `present` after an Away_Duration longer than the Breach_Time, THE Haunt_Engine SHALL show the Spoiler_Threat as described in criteria 11 and 18, provided the Return_Planner planned one.
2. WHEN the Spoiler_Threat is planned, THE Return_Planner SHALL choose exactly one sentence, taken from the text of the Final_Chapter only, and SHALL choose a sentence of 5 to 25 words.
3. IF the book has no chapter structure, has only one chapter, or the reader is in the Final_Chapter, THEN THE Return_Planner SHALL plan no Spoiler_Threat and THE Haunt_Engine SHALL show no card, with the rest of the return flow unchanged.
4. IF the Final_Chapter has no sentence of 5 to 25 words, THEN THE Return_Planner SHALL plan no Spoiler_Threat and THE Haunt_Engine SHALL show no card, with the rest of the return flow unchanged.
5. THE Return_Planner SHALL compute the Legibility as a value from 0 to 1 inclusive that does not decrease as the Away_Duration increases.
6. WHERE the Haunt_Mode is Classic, THE Return_Planner SHALL compute a Legibility below 0.7 for every Away_Duration, including Away_Durations longer than the Reveal_Time.
7. WHERE the Haunt_Mode is Nightmare, THE Return_Planner SHALL compute a Legibility of exactly 1 when the Away_Duration is at least the Reveal_Time, and a Legibility below 1 when the Away_Duration is less than the Reveal_Time.
8. WHILE the Legibility is below 1, THE Haunt_Engine SHALL render the sentence blurred, with a blur radius that does not decrease as the Legibility decreases and is greater at a Legibility of 0 than at a Legibility of 0.69.
9. WHILE the Legibility is below 1, THE Haunt_Engine SHALL keep the sentence text out of the accessibility tree and out of text selection, and SHALL expose a text label stating that a ghost holds a blurred sentence.
10. WHEN the Return_Moment runs and a Spoiler_Threat is planned, THE Ghost_Figure_Layer SHALL draw the Ghost holding the card for the duration of the Return_Moment, which is at most 3 seconds.
11. WHEN the Return_Moment ends and a Spoiler_Threat is planned AND the free space beside the Reading_Column is at least 160 px wide, THE Haunt_Engine SHALL keep the card visible without the Ghost figure, placed beside the Reading_Column with no overlap with the Reading_Column bounds and no cover over the active paragraph, until the reader dismisses it or 10 seconds have passed since the Return_Moment ended, whichever comes first, and SHALL then remove it.
12. WHEN the reader activates the dismiss control or presses the Escape key while the card is visible, including during the Return_Moment while the Ghost holds the card, THE Haunt_Engine SHALL remove the Spoiler_Threat within 300 ms.
13. THE Spoiler_Threat SHALL provide a dismiss control that has a text label, shows a visible focus ring when focused, and can be activated with the Enter key and the Space key.
14. THE Haunt_Engine SHALL read the Final_Chapter text on the device and SHALL send no book text over the network when planning, showing, or dismissing a Spoiler_Threat.
15. WHERE the Haunt_Mode is Gentle, THE Haunt_Engine SHALL show no Spoiler_Threat.
16. WHEN the Haunt_Engine shows, removes, or times out a Spoiler_Threat, THE Haunt_Engine SHALL leave the reading position, the saved progress, and the pace data equal to their values before the Spoiler_Threat was shown.
17. WHERE Reduced_Motion is on, WHEN the Spoiler_Threat appears or is removed, THE Haunt_Engine SHALL use a fade of at least 300 ms with no sudden movement and no flicker.
18. WHERE a Spoiler_Threat is planned AND the free space beside the Reading_Column is under 160 px wide, THE Haunt_Engine SHALL show the card only during the Return_Moment, MAY let the card cover the text during the Return_Moment, and SHALL hide the card when the Return_Moment ends, with the dismiss control and the Escape key of criteria 12 and 13 working throughout the Return_Moment.

### Requirement 8: Haunt modes

**User Story:** As a reader, I want to choose how scary the haunting is, so that it suits me.

#### Acceptance Criteria

1. THE Haunt_Engine SHALL offer exactly three Haunt_Modes: Gentle, Classic and Nightmare.
2. IF no valid saved Haunt_Mode exists, THEN THE Haunt_Engine SHALL use Classic.
3. WHEN the Safety_Notice is shown, THE Safety_Notice SHALL list the three Haunt_Modes, each with a description of at most 120 characters, and SHALL preselect Classic.
4. THE Haunt_Control SHALL replace the gentle-mode toggle with a three-way Haunt_Mode choice in the top bar, and the reader SHALL be able to change the choice at any time, including during a Look_Away, a Return_Moment or a Spoiler_Threat.
5. WHEN the reader changes the Haunt_Mode, THE Haunt_Engine SHALL apply the new Haunt_Mode within 200 ms and save it locally.
6. WHEN the reading view opens, THE Haunt_Engine SHALL restore the saved Haunt_Mode before the first haunt can start.
7. IF a saved gentle setting is "on" and no saved Haunt_Mode exists, THEN THE settings store SHALL set the Haunt_Mode to Gentle.
8. IF a saved gentle setting is "off" and no saved Haunt_Mode exists, THEN THE settings store SHALL set the Haunt_Mode to Classic.
9. IF the saved Haunt_Mode is unreadable or not one of "Gentle", "Classic" or "Nightmare", THEN THE settings store SHALL use Classic and SHALL leave the reading view usable without showing an error.
10. WHEN the Haunt_Mode changes to Gentle while a Look_Away, a Return_Moment or a Spoiler_Threat is running, THE Haunt_Engine SHALL fade out the Ghost, every Spatial_Sound layer and every Glitch, and stop any Jumpscare, within 800 ms.
11. THE Haunt_Control SHALL expose a text label and the current selection to screen readers, work with the keyboard alone, and show a visible focus ring.
12. THE Level_Logic SHALL take the Haunt_Mode in place of the gentle flag, and WHILE the Haunt_Mode is Gentle, THE Level_Logic SHALL return a Haunt_Level of at most 1 and no companion haunt.

### Requirement 9: Safety rules for every effect

**User Story:** As a reader, I want every ghost effect to follow the safety rules, so that a scare is never harmful.

#### Acceptance Criteria

1. THE Safety_Gate SHALL be the only code that applies the Volume_Cap, sound fade-in, flash-rate limit and Reduced_Motion rules for every effect in this spec.
2. THE Haunt_Engine SHALL send every Ghost, Glitch, Jumpscare, Evidence_Message and Spoiler_Threat visual request through the Safety_Gate visual output.
3. THE Safety_Gate SHALL limit the combined flashes of all running effects, including Glitch and Jumpscare, to at most 3 flashes in any 1-second window.
4. THE Safety_Gate SHALL keep the combined gain of all sounds playing at the same time, including the Jump_Sound, at or below the Volume_Cap at every instant.
5. WHEN the Volume_Cap changes while a sound is playing, THE Safety_Gate SHALL apply the new cap to all playing sounds within 100 ms.
6. THE Safety_Gate SHALL start every sound other than the Jump_Sound with a fade-in of at least 300 ms.
7. THE Safety_Gate SHALL start the Jump_Sound with an attack of at least 20 ms, and only during a Return_Moment.
8. THE Haunt_Engine SHALL start a Glitch or a Jumpscare only during a Return_Moment.
9. WHILE the Attention_Signal is `present` and no Return_Moment is running, THE Haunt_Engine SHALL show no Ghost, no Glitch and no Jumpscare.
10. WHILE Reduced_Motion is on, THE Safety_Gate SHALL replace every Glitch and Jumpscare with a fade of at least 500 ms that has no sudden movement and no flicker.
11. THE Haunt_Engine SHALL keep the reading text at a contrast ratio of at least 4.5:1 against `--bg` at every Haunt_Level outside the Return_Moment.
12. THE Haunt_Engine SHALL use only the theme colours from `src/ui/theme.css` or colours derived from them, and SHALL show no full-screen flash of saturated red.
13. WHILE the Safety_Notice has not been dismissed, THE Haunt_Engine SHALL show no Ghost and play no sound.
14. THE Haunt_Engine SHALL send no data over the network and SHALL store or log no video frame and no camera data, WHERE the only network requests the Haunt_Engine makes are same-origin requests for a Ghost_Asset or a Haunt_Sound whose file name is an exact entry of the Asset_Allowlist.
15. THE Haunt_Engine SHALL receive Attention_Signal values only through `subscribeSignal` and SHALL import no camera, detector or video code.

### Requirement 10: Safety notice and headphones tip

**User Story:** As a reader, I want to be told what to expect and to wear headphones for the best effect, so that I can choose before I begin.

#### Acceptance Criteria

1. WHEN the Safety_Notice is shown, THE Safety_Notice SHALL state that haunts include dimming light, ghosts, glitching of the page, and quiet or sudden sound, and SHALL contain no mention of a shadow.
2. WHEN the Safety_Notice is shown for the first session, THE Safety_Notice SHALL include a recommendation to wear headphones for the best effect, within the same notice and not as a separate dialog.
3. WHEN the Safety_Notice is shown in any session after the first session, THE Safety_Notice SHALL omit the headphones recommendation.
4. WHEN the Safety_Notice is shown, THE Safety_Notice SHALL state that the reader can turn sound off or choose the Gentle Haunt_Mode, and SHALL present a control for choosing among Gentle, Classic and Nightmare, with Classic preselected.
5. WHEN the reader dismisses the Safety_Notice, THE Haunt_Engine SHALL save the selected Haunt_Mode and a flag recording that the notice was seen, such that both values are restored on the next page load on the same device.
6. IF the Haunt_Mode or seen flag cannot be saved when the reader dismisses the Safety_Notice, THEN THE Haunt_Engine SHALL continue the session using the selected Haunt_Mode, keep the reader on the page, and show a message that the choice will not be remembered.
7. WHILE the Safety_Notice is shown, THE Safety_Notice SHALL allow every control, including the Haunt_Mode choice and the dismiss action, to be reached and operated using the keyboard alone, with a visible focus indicator on the focused control.
8. WHILE the Safety_Notice is shown, THE Safety_Notice SHALL keep the Camera_Consent_Dialog from appearing, and THE Safety_Notice SHALL allow the Camera_Consent_Dialog to appear only after the Safety_Notice is dismissed, as specified in the haunt-feature spec.

### Requirement 11: Return planning is pure

**User Story:** As a developer, I want the decisions about each effect to be pure functions, so that I can property-test them without a browser.

#### Acceptance Criteria

1. THE Return_Planner SHALL take the Haunt_Mode, Away_Duration (in milliseconds, 0 or greater), history of earlier Qualifying_Returns and their Jumpscare outcomes, random rolls (each a number from 0 inclusive to 1 exclusive), Reduced_Motion, the active paragraph, the count of Look_Aways in the chapter (0 or greater) and the Final_Chapter sentences as input, and return the Return_Moment plan as output.
2. THE Return_Planner SHALL return the same output for the same input.
3. THE Return_Planner SHALL use no DOM, no audio, no camera, no timer and no global clock.
4. FOR ALL inputs, THE Return_Planner SHALL return a Return_Moment duration between 0 and 3000 ms inclusive.
5. FOR ALL inputs with the Haunt_Mode Gentle, THE Return_Planner SHALL return no Jumpscare, no Glitch, no Evidence_Message and no Spoiler_Threat.
6. FOR ALL inputs, THE Return_Planner SHALL return no Jumpscare when the Away_Duration is below 10 seconds.
7. FOR ALL sequences of Qualifying_Returns in Classic, THE Return_Planner SHALL return at most 1 Jumpscare in any three consecutive returns.
8. FOR ALL sequences of Qualifying_Returns in Nightmare, THE Return_Planner SHALL return at most 2 Jumpscares in any three consecutive returns.
9. FOR ALL inputs, THE Return_Planner SHALL return at most one Jumpscare per Return_Moment, and a False_Calm that is either none or between 300 and 800 ms inclusive.
10. FOR ALL paragraphs and Evidence_Messages, replacing the words and then restoring SHALL produce text equal to the original paragraph, character for character (round-trip property).
11. FOR ALL inputs that include a Spoiler_Threat, THE Return_Planner SHALL choose a Spoiler_Threat sentence that appears in the Final_Chapter sentences and not in any other chapter.
12. IF the Final_Chapter sentences contain no sentence that appears in no other chapter, THEN THE Return_Planner SHALL return no Spoiler_Threat and still return a valid Return_Moment plan.
13. FOR ALL Away_Durations a and b with a at most b and the same Haunt_Mode, THE Return_Planner SHALL return a Legibility for a that is at most the Legibility for b.
14. FOR ALL Away_Durations in Classic, THE Return_Planner SHALL return a Legibility below 1.
15. FOR ALL counts of Look_Aways in a chapter, THE Ghost_Distance function SHALL return an integer step between 0 and 4 inclusive that does not fall as the count grows.
16. FOR ALL inputs, THE Return_Planner SHALL return a Glitch duration below 1000 ms and at most 3 flickers per second, and with Reduced_Motion on SHALL return a slow fade with no flicker and no sudden movement.
17. FOR ALL Ghost_Distance steps and side-region sizes, THE Image_Layer transform function SHALL return a scale and a position that keep the Image_Layer's rendered bounds within the side region, and SHALL return a strictly larger scale for a higher step than for a lower step.
18. FOR ALL file names, THE Asset_Allowlist lookup function SHALL accept exactly the file names listed in the Asset_Allowlist and SHALL reject every other string, including a string that differs only by case, by an added path segment, or by a query string.
19. FOR ALL scales at or below the largest permitted on-screen scale, THE Red_Coverage function for `ghost-face.png` SHALL return a value at or below the bound of requirement 15 criterion 6.
20. FOR ALL Event_Sound and Continuous_Layer gain combinations, THE Event_Headroom function SHALL return true only when the Event_Sound's peak level is at least 6 dB above the combined Continuous_Layer level, and SHALL keep the Event_Sound's level at or below the Volume_Cap.
21. FOR ALL Breathing_Layer pulse schedules, THE gap between one breath pulse and the next SHALL contain no sample above the layer's noise floor.
22. FOR ALL Ghost_Asset load outcomes, THE Ghost_Figure_Layer SHALL show the Image_Layer when the load and decode succeed, and SHALL show the SVG fallback when and only when the load or the decode fails.
23. FOR ALL values of the Rim_Glow user setting, saving the setting and reading it back SHALL return the same value (round-trip property).

### Requirement 12: Taunts that refer to the book (optional, built last)

**User Story:** As a reader, I want the ghost's messages to mention people from my book, so that the haunting feels personal.

#### Acceptance Criteria

1. WHEN the Taunt_Builder receives the text read so far, THE Taunt_Builder SHALL return a list of at most 10 Name_Candidates ordered by descending occurrence count, with ties ordered by first appearance in the text.
2. THE Taunt_Builder SHALL take Name_Candidates only from text that ends at the Reading_Position, and SHALL ignore all text at or after the Reading_Position.
3. THE Taunt_Builder SHALL exclude from Name_Candidates a capitalised word that appears only as the first word of a sentence, and SHALL keep a capitalised word that also appears capitalised at least once elsewhere inside a sentence.
4. THE Taunt_Builder SHALL exclude from Name_Candidates every word that matches an entry in the common-word list, ignoring letter case.
5. WHEN the Taunt_Builder fills a Taunt_Template, THE Taunt_Builder SHALL replace every `{name}` slot with a Name_Candidate, and the filled taunt SHALL contain no `{` and no `}` character.
6. IF the Taunt_Builder finds no Name_Candidate, THEN THE Taunt_Builder SHALL choose a Name_Free_Template.
7. THE Taunt_Builder SHALL use only original Taunt_Templates, and each filled taunt SHALL contain at most 8 words when the substituted name has 1 or 2 words.
8. WHEN the Return_Planner plans an Evidence_Message, THE Return_Planner SHALL choose one message from the set formed by the fixed messages and the filled Taunt_Templates.
9. WHERE a non-empty list of cached taunts is provided by a later spec, THE Taunt_Builder SHALL choose taunts from the cached taunts that remain after discarding, in place of Taunt_Templates.
10. IF a cached taunt contains a `{` or `}` character or has more than 8 words, THEN THE Taunt_Builder SHALL discard that cached taunt and SHALL keep the other cached taunts.
11. IF the cached taunt list is empty, missing, or has every entry discarded, THEN THE Taunt_Builder SHALL use Taunt_Templates.
12. WHEN the Taunt_Builder builds a taunt, THE Taunt_Builder SHALL make zero network requests and SHALL send no book text over the network, WHERE this criterion does not restrict the same-origin Asset_Allowlist requests permitted by requirement 9 criterion 14.
13. FOR ALL texts and Reading_Positions, every Name_Candidate SHALL appear in the text before the Reading_Position.
14. FOR ALL texts and templates, THE Taunt_Builder SHALL return a taunt with no `{` and no `}` character.
15. FOR ALL texts with no Name_Candidate, THE Taunt_Builder SHALL return a Name_Free_Template.

### Requirement 13: Amendments to the haunt-feature spec

**User Story:** As a developer, I want the older spec to match the new behaviour, so that the two specs do not contradict each other.

#### Acceptance Criteria

1. THE haunt-feature spec SHALL amend criterion 2.2 so that ambient haunt effects finish fading out within 800 ms after the Attention_Signal becomes `present`, and so that the Ghost MAY remain visible for the Return_Moment of at most 3000 ms after the Attention_Signal becomes `present`.
2. THE haunt-feature spec SHALL amend criterion 3.5 of the haunt-safety rule and the haunt list in the haunt-feature spec so that the Ghost replaces the shadow haunt, and so that the haunt list contains no entry for a shadow haunt and no shadow haunt file is built.
3. THE haunt-feature spec SHALL amend criteria 6.11, 6.12 and 16.4 so that, during the Return_Moment of at most 3000 ms, the Return_Moment effects, including the Evidence_Message, MAY cover or change the Reading_Column, and so that the Reading_Column is fully readable and identical in content and layout to its state before the Return_Moment within 100 ms after the Return_Moment ends.
4. THE haunt-feature spec SHALL amend criteria 7.1 to 7.4, 9.3 and 9.5 so that each reference to Gentle_Mode refers to the Gentle value of the Haunt_Mode, which has exactly three values (Gentle, Classic and Nightmare), with Classic as the default, and so that Gentle limits haunts to level 1 with no Ghost figures, glitch effects or jumpscares.
5. THE haunt-feature spec SHALL amend criterion 8.2 so that the Safety_Notice text describes ghosts and glitching, and contains no description of a moving shadow.
6. THE Restricted_Audio_Context SHALL provide one panner wrapper for the HRTF PannerNode, and SHALL provide no other new path to the audio device.
7. WHERE a sound is played through the panner wrapper, THE Restricted_Audio_Context SHALL apply the user volume cap and the fade-in and attack limits of the haunt-safety rule to that sound, the same as for every other sound.

### Requirement 14: Bundled image and audio assets

**User Story:** As a developer, I want ghost images and recorded sounds to load only from this app, so that the reader's privacy and the app's safety rules are never put at risk by a third-party asset host.

#### Acceptance Criteria

1. THE Asset_Loader SHALL request a Ghost_Asset or a Haunt_Sound only by a relative, same-origin URL beginning with `/ghosts/` or `/sounds/`.
2. THE Asset_Loader SHALL make no request to any origin other than the application's own origin when loading a Ghost_Asset or a Haunt_Sound.
3. THE Asset_Loader SHALL accept only a file name that is an exact entry of the Asset_Allowlist, and SHALL reject every other file name without making a request.
4. THE Haunt_Engine SHALL contain no literal `http://` or `https://` URL pointing at a Ghost_Asset or a Haunt_Sound.
5. THE Haunt_Sound files SHALL contain no speech and no lyrics.
6. WHERE a Ghost_Asset or a Haunt_Sound is added to the repository, THE README SHALL list that file with its source and its licence.
7. THE Haunt_Engine SHALL load every Ghost_Asset as a PNG or WebP file and every Haunt_Sound as an MP3 file, with no other media file type bundled under `public/ghosts/` or `public/sounds/`.

### Requirement 15: Ghost images

**User Story:** As a reader, I want the ghost to look like a real drawn or photographed figure, not a cartoon, so that it feels unsettling rather than silly.

#### Acceptance Criteria

1. WHILE the Attention_Signal is `away` AND the Haunt_Mode is Classic or Nightmare, THE Ghost_Figure_Layer SHALL draw the Ghost using the Ghost_Asset `ghost-standing.png` through an Image_Layer, with opacity, scale, and position set per the Ghost_Distance step.
2. WHEN the Ghost_Distance increases by one step, THE Ghost_Figure_Layer SHALL increase the Image_Layer's rendered scale, so the Ghost appears closer at a higher step than at a lower step.
3. THE Ghost_Figure_Layer SHALL keep every drawn pixel of the Image_Layer outside the Reading_Column bounds while the Attention_Signal is `away` and no Jumpscare is running.
4. THE Safety_Gate SHALL limit the combined flashes contributed by any Image_Layer movement to at most 3 per second, counted together with every other running effect.
5. THE Haunt_Engine SHALL show no Image_Layer and no SVG Ghost that produces a full-screen flash of saturated red at any scale.
6. THE Haunt_Engine SHALL keep the Red_Coverage of the `ghost-face.png` Ghost_Asset, rendered at its largest permitted on-screen scale, at or below 15 percent of the viewport area.
7. WHILE Reduced_Motion is on, THE Ghost_Figure_Layer SHALL show the Image_Layer with a fade of at least 1000 ms and no change in scale and no change in position during or after the fade.
8. WHILE the Attention_Signal is `present` and no Return_Moment is running, THE Haunt_Engine SHALL keep the Reading_Column text at a contrast ratio of at least 4.5:1 against `--bg`, with every Image_Layer positioned beside the Reading_Column.
9. WHEN the Jumpscare starts in Nightmare, THE Ghost_Figure_Layer SHALL show the Ghost_Asset `ghost-face.png` through an Image_Layer that scales up within the Return_Moment, starting and ending inside the Return_Moment's 3000 ms bound.
10. WHEN the Jumpscare starts in Classic, THE Ghost_Figure_Layer SHALL show the Ghost_Asset `ghost-standing.png` through an Image_Layer that scales up at a smaller maximum scale than the Nightmare Jumpscare uses, starting and ending inside the Return_Moment's 3000 ms bound.
11. WHILE Reduced_Motion is on, THE Ghost_Figure_Layer SHALL replace the Jumpscare Image_Layer rush with a fade of at least 1000 ms and no change in scale.
12. WHEN the Ghost begins to fade in after a Look_Away starts, THE Ghost_Figure_Layer SHALL play a Smoke_Entrance of blurred, theme-coloured shapes that precedes the Ghost's own fade-in, with no flicker.
13. WHILE Reduced_Motion is on, THE Ghost_Figure_Layer SHALL replace the Smoke_Entrance with a fade and SHALL introduce no additional movement.
14. WHILE the Ghost is drawn, THE Ghost_Figure_Layer SHALL draw a Rim_Glow around the Ghost's silhouette using a theme colour, WHERE the Rim_Glow user setting is on.
15. THE Haunt_Control SHALL expose a labelled, keyboard-accessible control for the Rim_Glow user setting, and THE Haunt_Engine SHALL store the setting under a documented localStorage key.
16. THE Rim_Glow user setting SHALL default to on.
17. THE Rim_Glow SHALL NOT flash faster than 3 times per second and SHALL NOT pulse faster than that rate.
18. WHILE the Attention_Signal is `present` and no Return_Moment is running, THE Rim_Glow SHALL NOT appear over the Reading_Column text.
19. IF a Ghost_Asset fails to load or fails to decode, THEN THE Ghost_Figure_Layer SHALL draw the existing SVG Ghost in its place, with no error shown to the reader during reading.

### Requirement 16: Recorded sounds

**User Story:** As a reader, I want footsteps, breathing, and other haunt sounds to sound real rather than synthetic, so that the haunting feels less annoying and more frightening.

#### Acceptance Criteria

1. THE Asset_Loader SHALL decode a Haunt_Sound from `public/sounds/` using a same-origin `fetch` followed by `decodeAudioData` into a buffer usable by the Restricted_Audio_Context.
2. WHERE a Haunt_Sound recording for footsteps, breathing, knock, heartbeat, or creak is present and decodes without error, THE corresponding haunt SHALL play that recording in place of its generated fallback.
3. IF a Haunt_Sound recording is missing, fails to fetch, or fails to decode, THEN THE corresponding haunt SHALL play its generated fallback sound, with no error shown to the reader during reading.
4. THE Jumpscare SHALL play the Haunt_Sound `scream.mp3` as its Jump_Sound WHERE that recording is present and decodes without error, and SHALL play its generated fallback otherwise.
5. WHEN the Classic Jumpscare plays its Jump_Sound, THE Jumpscare SHALL play the same `scream.mp3` recording (or the same generated fallback) used by the Nightmare Jumpscare, scaled to the same Volume_Cap rules, so the two Haunt_Modes differ only in the visual rush and the Jumpscare frequency.
6. THE Haunt_Sound playback for every Event_Sound and every Continuous_Layer SHALL stay at or below the Volume_Cap at every instant, through the Safety_Gate.
7. THE Haunt_Sound pulse within a running layer SHALL have an attack of at least 20 ms and SHALL never exceed that layer's current gain target.
8. THE Jump_Sound built from a Haunt_Sound recording SHALL play only during a Return_Moment, with the same attack and cap rules as the generated Jump_Sound.
9. WHERE a heartbeat Haunt_Sound is present, THE heartbeat haunt SHALL play in Classic and Nightmare only, starting at a Haunt_Level of 2 or higher, with its level rising as the Haunt_Level rises.
10. WHERE a creak Haunt_Sound is present, THE creak haunt SHALL play in Classic and Nightmare only, starting at a Haunt_Level of 1 or higher, as an occasional Event_Sound rather than a Continuous_Layer.
11. THE heartbeat and creak haunts SHALL each be one file in `src/haunts/`, requiring no edit to the engine to add.

### Requirement 17: Sound mix

**User Story:** As a reader, I want the haunt sounds to build dread instead of noise, so that footsteps, knocks, and other events stand out rather than being buried.

#### Acceptance Criteria

1. WHILE the Haunt_Mode is Classic or Nightmare, THE Haunt_Engine SHALL play no Continuous_Layer of whispers.
2. WHERE the Haunt_Mode is Gentle, THE Haunt_Engine SHALL play the whisper layer exactly as it already plays before this amendment.
3. WHILE the Breathing_Layer plays, THE Breathing_Layer SHALL play separate breath pulses with silence between them, and SHALL NOT play as a Continuous_Layer.
4. WHILE the Haunt_Level is 2 or higher AND the Haunt_Mode is Classic or Nightmare, THE Haunt_Engine MAY play a low drone Continuous_Layer at a gain lower than every Event_Sound's layer target.
5. FOR EVERY Event_Sound, WHILE that Event_Sound plays at the same instant as one or more Continuous_Layers, THE Haunt_Engine SHALL keep the Event_Sound's peak level at least 6 dB above the combined level of the Continuous_Layers at that instant, while the Event_Sound's level stays at or below the Volume_Cap.
6. THE footsteps haunt SHALL play a footstep sound whose generated fallback has a lower-frequency body component and a two-part heel-toe pulse shape, so that the fallback is not thinner, in its low-frequency content, than the recorded footstep sound.
7. THE Haunt_Engine SHALL keep the rules of Requirement 9 (Safety rules for every effect) unchanged for every sound introduced by this amendment.
