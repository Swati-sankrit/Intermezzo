# Requirements Document

## Introduction

The attention module lives in `src/attention/`. It decides whether the reader is facing the screen and exposes exactly one output: a signal of `present` or `away`, with a timestamp. No other module touches the camera or receives anything else from the attention module.

When the camera is on, the module estimates head pose (yaw and pitch) and face presence from face landmarks produced on-device. It does not use eye gaze. In Camera_Mode the reader is also away when the tab is hidden or the window has lost focus for longer than the Debounce_Time, even if the camera sees a face. So away means the camera says away OR the tab is hidden or unfocused. When the camera is off or permission is denied, the module produces the same signal from tab visibility, window focus, and idle time, without nagging.

The module offers `pause()` and `resume()` so that a later spec, "discipline-loop", can suspend tracking (for example during a rest). This spec defines only what `pause()` and `resume()` do inside the Attention_Module. It does not define when discipline-loop calls them or any behaviour of discipline-loop. The reading view sets the Idle_Limit; the module knows nothing about books or paragraphs.

The decision logic is a pure function: landmark-derived pose, presence, and tab-active samples in, `present` or `away` out. It has no DOM, camera, or timer access, so it is tested with fast-check property tests over generated input sequences. The camera, MediaPipe Face Landmarker, and fallback listeners are thin adapters around that function.

Design and implementation phases: before writing any camera or MediaPipe code, fetch the current MediaPipe tasks-vision documentation through the Context7 MCP server. Do not rely on remembered APIs.

## Glossary

- **Attention_Module**: The code in `src/attention/` that produces the Attention_Signal.
- **Attention_Signal**: The only output of the Attention_Module: a value of `present` or `away` paired with a timestamp in milliseconds.
- **Decision_Function**: The pure function that takes a sequence of Pose_Samples, the Thresholds, the Debounce_Time, and the Return_Time, and returns an Attention_Signal.
- **Pose_Sample**: One timestamped input to the Decision_Function: face presence (found or not found), head yaw in degrees, head pitch in degrees, and the Tab_Active flag.
- **Tab_Active**: A boolean carried in each Pose_Sample. It is true when the tab is visible and the window has focus, and false when the tab is hidden or the window has lost focus. The Attention_Module adapter reads the DOM and passes the value in; the Decision_Function never reads the DOM.
- **Away_Sample**: A Pose_Sample with Tab_Active false, or no face found, or a yaw or pitch that is beyond the Thresholds.
- **Facing_Sample**: A Pose_Sample that is not an Away_Sample.
- **Baseline**: The per-reader pair of head angles in degrees, baselineYaw and baselinePitch, that Calibration records as the median yaw and median pitch of the looking-at-page samples. The Baseline is the reader's own centre, so an off-centre webcam does not shift the Thresholds.
- **Thresholds**: The per-reader set of four values in degrees: baselineYaw, baselinePitch, yawLimit, and pitchLimit. A Pose_Sample is beyond the Thresholds when the absolute value of (yaw minus baselineYaw) is strictly greater than yawLimit, or the absolute value of (pitch minus baselinePitch) is strictly greater than pitchLimit. A difference exactly equal to a limit is not beyond. Because the difference is measured from the Baseline, a turn to either side counts equally. Valid Thresholds have finite values and limits greater than 0.
- **Default_Thresholds**: A Baseline of 0 degrees yaw and 0 degrees pitch, a yawLimit of 25 degrees, and a pitchLimit of 20 degrees. The Attention_Module uses them until Calibration succeeds, and whenever stored Thresholds are missing or invalid or Calibration is skipped.
- **Debounce_Time**: The continuous time a reader must be away before `away` is emitted. Default 1500 ms.
- **Return_Time**: The maximum time between the reader facing the screen again and `present` being emitted. Default 1000 ms.
- **Camera_Mode**: The operating mode in which the Attention_Module derives the Attention_Signal from the camera and from Tab_Active.
- **Fallback_Mode**: The operating mode in which the Attention_Module derives the Attention_Signal from tab visibility and idle time.
- **Idle_Time**: Time since the last keyboard, pointer, or touch input in the app.
- **Idle_Limit**: The Idle_Time after which the reader counts as away in Fallback_Mode. The reading view sets it to 3 times the suggested time of the current paragraph. The Attention_Module enforces a minimum of 60 s and uses 60 s until the reading view sets it.
- **Camera_Consent_Dialog**: The dialog that explains in plain words why the camera is used and asks for permission.
- **Camera_Indicator**: The small visible marker in the top bar shown while the camera is on, with a control to turn the camera off.
- **Calibration**: The guided routine of looking at the page for 5 s, then looking away for 5 s, used to set the Thresholds.
- **Face_Status_Marker**: The text-plus-icon marker on the Calibration screen that reads "Face detected" or "No face detected". It is derived only from a boolean face-found state.
- **Settings_Screen**: The app screen where reader preferences, including recalibration, are changed.
- **Paused_State**: The state the Attention_Module is in between a call to `pause()` and the next call to `resume()`.
- **Session**: One continuous reading period that starts when the reader opens a book to read and ends when the reader leaves the reading view.
- **Frame**: A single video image from the camera.

## Requirements

### Requirement 1: Explain and Ask for Camera Permission

**User Story:** As a reader, I want to be told in plain words why the camera is used before I am asked for access, so that I can make an informed choice.

#### Acceptance Criteria

1. WHEN a Session starts and no recorded camera choice exists, THE Attention_Module SHALL show the Camera_Consent_Dialog and SHALL NOT request camera access from the browser until the reader chooses "Turn on camera".
2. THE Camera_Consent_Dialog SHALL display text stating all three of the following: the camera is used only to tell whether the reader is facing the screen, processing happens on the device, and no Frame is stored or sent.
3. THE Camera_Consent_Dialog SHALL offer exactly two actions: a button labelled "Turn on camera" and a button labelled "Read without camera".
4. WHEN the reader chooses "Turn on camera", THE Attention_Module SHALL record the choice locally, close the Camera_Consent_Dialog, and request camera access from the browser.
5. WHEN the reader chooses "Read without camera", THE Attention_Module SHALL close the Camera_Consent_Dialog, enter Fallback_Mode, and record that choice locally, without requesting camera access from the browser.
6. WHEN a Session starts and a recorded camera choice exists from an earlier Session, THE Attention_Module SHALL NOT show the Camera_Consent_Dialog and SHALL apply the recorded choice.
7. IF the browser denies camera access, THEN THE Attention_Module SHALL enter Fallback_Mode within 1000 ms, show exactly one on-screen notice per Session stating that reading continues without the camera, and SHALL NOT show the Camera_Consent_Dialog, show any further notice about the denial, or request camera access again in that Session unless the reader turns the camera on from the Settings_Screen, and THE Settings_Screen SHALL show the camera as unavailable.
8. IF the recorded camera choice cannot be read or written, THEN THE Attention_Module SHALL treat the choice as unanswered for the current Session, show the Camera_Consent_Dialog, and allow the Session to continue after the reader picks either button.
9. WHEN the Camera_Consent_Dialog opens, THE Camera_Consent_Dialog SHALL move keyboard focus to the first interactive element inside it, keep Tab and Shift+Tab focus within the dialog, and make both buttons activatable with Enter or Space.
10. WHEN the Camera_Consent_Dialog closes, THE Camera_Consent_Dialog SHALL return keyboard focus to the element that had focus immediately before it opened.

### Requirement 2: Show a Camera Indicator

**User Story:** As a reader, I want to see clearly whenever the camera is on and turn it off with one click, so that I stay in control of my privacy.

#### Acceptance Criteria

1. WHILE the camera is on, THE Camera_Indicator SHALL be visible in the top bar, and THE Camera_Indicator SHALL appear within 500 ms of the camera starting.
2. WHILE the camera is on, THE Camera_Indicator SHALL remain at 100% opacity, including when the top bar has faded to its reading-state opacity.
3. WHEN the reader activates the Camera_Indicator's off control with a click, a tap, or the Enter or Space key, THE Attention_Module SHALL stop all camera tracks, remove the Camera_Indicator, and enter Fallback_Mode within 500 ms.
4. THE Camera_Indicator SHALL have an accessible name that states the camera is on, and its off control SHALL have an accessible name that states it turns the camera off.
5. THE Camera_Indicator's off control SHALL be reachable with the Tab key, SHALL show a visible focus ring when focused, and SHALL be operable with the keyboard alone.
6. WHEN the camera stops for any reason, including permission revoked, device unplugged, or a track ending, THE Attention_Module SHALL remove the Camera_Indicator within 500 ms and enter Fallback_Mode.
7. IF stopping a camera track fails when the reader activates the off control, THEN THE Attention_Module SHALL keep the Camera_Indicator visible, SHALL show an error message stating that the camera could not be turned off and how to turn it off in the browser, and SHALL keep the reader's reading position unchanged.

### Requirement 3: Calibrate Thresholds

**User Story:** As a reader, I want a short calibration that learns how I sit and look, so that the app judges my attention fairly.

#### Acceptance Criteria

1. WHEN the camera is turned on for the first time and no Thresholds are stored, THE Attention_Module SHALL offer Calibration with a visible option to start it and a visible option to skip it.
2. WHEN Calibration runs, THE Attention_Module SHALL complete the full Calibration, including both phases, in 15 s or less from the moment the reader starts it.
3. WHEN Calibration runs, THE Attention_Module SHALL first instruct the reader to look at the page for 5 s, then instruct the reader to look away for 5 s, and SHALL show the current phase and the seconds remaining in that phase as on-screen text.
4. WHEN Calibration completes with at least 10 Pose_Samples with a face found in the looking-at-page phase and a distance of at least 20 degrees in yaw or pitch between the median looking-away sample and the Baseline, THE Attention_Module SHALL set the Baseline to the median yaw and median pitch of the looking-at-page samples, set each limit as clamp(distance / 2, 10, default limit) in degrees for each axis (yaw or pitch) whose distance between the median looking-away sample and the Baseline is at least 20 degrees, where the default limit is 25 degrees for yaw and 20 degrees for pitch, and keep the default limit for an axis whose distance is less than 20 degrees, store the resulting Thresholds in local browser storage, and show a message confirming that Calibration succeeded.
5. FOR ALL Calibration sample sets in which the absolute difference between the median looking-away yaw and baselineYaw is at least 20 degrees, or the absolute difference between the median looking-away pitch and baselinePitch is at least 20 degrees, THE Thresholds computed SHALL have finite limits greater than 0, SHALL classify the median looking-at-page sample (the Baseline) as within the Thresholds, and SHALL classify the median looking-away sample as beyond the Thresholds.
6. IF Calibration gathers fewer than 10 Pose_Samples with a face found in the looking-at-page phase, THEN THE Attention_Module SHALL keep the previous Thresholds, or the Default_Thresholds if none exist, and show a message indicating that no face was seen and how to retry, with a visible option to retry.
7. IF the distance between the median looking-away sample and the Baseline is less than 20 degrees in both yaw and pitch, THEN THE Attention_Module SHALL keep the previous Thresholds, or the Default_Thresholds if none exist, and show a message offering to repeat Calibration, with a visible option to repeat it.
8. WHEN the reader activates "Recalibrate" in the Settings_Screen, THE Attention_Module SHALL run Calibration and, only if Calibration succeeds under criterion 4, replace the stored Thresholds.
9. WHEN the reader chooses to skip Calibration, either before it starts or while it is running, THE Attention_Module SHALL stop Calibration, discard any Pose_Samples gathered, keep the previous Thresholds or the Default_Thresholds if none exist, and return the reader to the previous screen within 1 s.
10. FOR ALL valid Thresholds, storing then loading the Thresholds from local browser storage SHALL produce equal Thresholds (round-trip property).
11. IF stored Thresholds are missing, unparseable, contain a non-finite value, contain a yawLimit or pitchLimit that is not greater than 0, or otherwise fail validation when loaded, THEN THE Attention_Module SHALL use the Default_Thresholds, SHALL NOT show an error to the reader, and SHALL offer Calibration the next time the camera is turned on.
12. THE Calibration SHALL be fully operable with the keyboard alone, with a visible focus indicator on every control, and SHALL present its instructions and results as on-screen text.
13. WHILE the Calibration screen is open, THE Calibration screen SHALL show the Face_Status_Marker with the text "Face detected" when a face is found and "No face detected" when no face is found, and SHALL update the Face_Status_Marker within 500 ms of the face-found state changing.
14. THE Face_Status_Marker SHALL combine an icon with its text so that the state is not conveyed by colour alone, and SHALL be announced politely to screen readers (a polite live region) when its text changes.
15. THE Calibration screen SHALL NOT display the video feed, any Frame, or any yaw, pitch, or landmark value, and THE Face_Status_Marker SHALL be derived only from a boolean face-found state.

### Requirement 4: Decide Away from Face Presence, Head Pose, and Tab Activity

**User Story:** As a reader, I want the app to notice only a real look-away, so that brief glances do not trigger a haunt.

#### Acceptance Criteria

1. THE Decision_Function SHALL be a pure function that reads no clock, DOM, camera, or storage, and returns the same Attention_Signal for the same Pose_Sample sequence, Thresholds, Debounce_Time, and Return_Time, with tab visibility and window focus supplied only through the Tab_Active flag of each Pose_Sample.
2. THE Decision_Function SHALL use face presence, head yaw, head pitch, and Tab_Active, and SHALL NOT use eye gaze.
3. WHEN the Pose_Samples show a continuous run of Away_Samples lasting longer than the Debounce_Time, THE Decision_Function SHALL return `away` with the timestamp of the first sample whose timestamp is more than the Debounce_Time after the first sample of that run.
4. FOR ALL sequences of Pose_Samples in which every continuous run of Away_Samples lasts no longer than the Debounce_Time, THE Decision_Function SHALL never return `away`.
5. WHEN the Pose_Samples show a Facing_Sample, THE Decision_Function SHALL return `present` with the timestamp of the first Facing_Sample of the current run, where that timestamp is no later than the Return_Time after the first such sample.
6. FOR ALL sequences of Pose_Samples, THE Decision_Function SHALL return Attention_Signal timestamps that never decrease.
7. FOR ALL sequences of Pose_Samples whose final sample is a Facing_Sample, THE Decision_Function SHALL return `present` once the Return_Time has elapsed since the first sample of the final run of Facing_Samples.
8. FOR ALL Pose_Sample sequences and valid Thresholds, THE Decision_Function SHALL return exactly one of `present` or `away`.
9. FOR ALL Pose_Sample sequences, applying the Decision_Function to a sequence and then to the same sequence with consecutive duplicate samples removed (same timestamp, face presence, yaw, pitch, and Tab_Active) SHALL produce the same final Attention_Signal value.
10. WHERE the reader has changed the Debounce_Time setting, THE Decision_Function SHALL use the changed Debounce_Time, limited to the range 500 ms to 5000 ms.
11. IF the reader sets a Debounce_Time below 500 ms or above 5000 ms, THEN THE Decision_Function SHALL use the nearest bound (500 ms or 5000 ms).
12. IF a Pose_Sample contains a non-finite yaw or pitch value, THEN THE Decision_Function SHALL treat the sample as no face found.
13. IF a Pose_Sample has a timestamp earlier than the latest accepted sample, THEN THE Decision_Function SHALL ignore that sample and leave the returned Attention_Signal unchanged by it.
14. IF the Pose_Sample sequence is empty, THEN THE Decision_Function SHALL return `present`.
15. FOR ALL sequences of Pose_Samples in which every continuous run with Tab_Active false lasts no longer than the Debounce_Time, and every other Pose_Sample is a Facing_Sample, THE Decision_Function SHALL never return `away`.
16. WHEN the Pose_Samples show a continuous run with Tab_Active false lasting longer than the Debounce_Time, THE Decision_Function SHALL return `away` even if every sample in that run has a face found with yaw and pitch within the Thresholds.
17. IF no Thresholds from a successful Calibration are supplied, THEN THE Decision_Function SHALL use the Default_Thresholds, including their Baseline of 0 degrees yaw and 0 degrees pitch.
18. FOR ALL yaw values, pitch values, and valid Thresholds, THE Decision_Function SHALL treat a sample as not beyond the Thresholds when the absolute value of (yaw minus baselineYaw) is at most yawLimit and the absolute value of (pitch minus baselinePitch) is at most pitchLimit, and SHALL treat a sample as beyond the Thresholds when either absolute difference is strictly greater than its limit, for a turn to either side of the Baseline.
19. THE Attention_Module SHALL supply the Decision_Function with a Pose_Sample whenever Tab_Active changes value, so that a hidden or unfocused tab reaches the Decision_Function even when no detection runs.

### Requirement 5: Emit a Single Signal

**User Story:** As a developer of other modules, I want the attention module to expose one simple signal, so that the rest of the app never needs to touch the camera.

#### Acceptance Criteria

1. THE Attention_Module SHALL expose one subscription interface whose only payload is an Attention_Signal consisting of a value (`present` or `away`) and a timestamp in milliseconds.
2. WHEN the Attention_Signal changes value, THE Attention_Module SHALL notify each current subscriber exactly once with the new value and the timestamp of the change, within 100 ms of the change.
3. WHILE the Attention_Signal value is unchanged, THE Attention_Module SHALL send no further notifications to subscribers.
4. WHEN a subscriber subscribes, THE Attention_Module SHALL deliver the current Attention_Signal (value and timestamp) to that subscriber exactly once, within 100 ms of subscription, and to no other subscriber.
5. WHEN a Session starts, THE Attention_Module SHALL set the initial Attention_Signal to `present` with the Session start timestamp.
6. THE Attention_Module SHALL be the only module in the app that requests camera access or reads video Frames.
7. THE Attention_Module SHALL NOT expose Pose_Samples, landmarks, yaw, pitch, or Frames to any other module.
8. FOR ALL sequences of Attention_Signals emitted to a subscriber, consecutive emitted signals SHALL have different values and non-decreasing timestamps.
9. WHILE the Attention_Signal is `away`, THE Attention_Module SHALL keep the signal at `away` until a `present` condition from Requirement 4 or Requirement 6 is met.
10. WHEN a subscriber unsubscribes, THE Attention_Module SHALL send that subscriber no further notifications.
11. IF a subscriber's callback throws an error, THEN THE Attention_Module SHALL continue notifying the remaining subscribers and SHALL keep the Attention_Signal value unchanged.

### Requirement 6: Fall Back to Tab Visibility and Idle Time

**User Story:** As a reader who declines the camera, I want the app to still notice when I leave, so that I get the same experience without being watched.

#### Acceptance Criteria

1. WHILE the app is in Fallback_Mode, THE Attention_Module SHALL produce the Attention_Signal (`present` or `away`, with a timestamp) from tab visibility, window focus, and Idle_Time only, and SHALL NOT access the camera.
2. WHEN the tab has been hidden or the window has been without focus continuously for longer than the Debounce_Time, THE Attention_Module SHALL emit `away` once, with the timestamp of the emission.
3. WHEN Idle_Time exceeds the Idle_Limit, THE Attention_Module SHALL emit `away` once, with the timestamp of the emission. Idle_Time is the time since the last keyboard, mouse, touch, or scroll input.
4. WHEN the tab becomes visible and focused again, or input is received after an `away` emission, THE Attention_Module SHALL emit `present` within the Return_Time (at most 1000 ms), with the timestamp of the emission.
5. FOR ALL sequences of visibility, focus, and input events in which every hidden or unfocused run lasts no longer than the Debounce_Time and every idle run lasts no longer than the Idle_Limit, THE fallback decision function SHALL never return `away`.
6. IF the camera becomes unavailable during a Session (device unplugged, stream ended, or access revoked) or cannot be started for a reason other than permission denial, THEN THE Attention_Module SHALL enter Fallback_Mode within 1000 ms, remove the Camera_Indicator within that same period, show exactly one on-screen notice stating that reading continues without the camera, and keep the reader's current position and Session data unchanged.
7. THE fallback decision function SHALL be a pure function whose output depends only on its arguments (event history and current time passed in), and it SHALL read no clock, DOM, or storage.
8. THE Attention_Module SHALL provide an operation with which the caller sets the Idle_Limit, and THE Attention_Module SHALL NOT read any book, chapter, or paragraph data to compute the Idle_Limit.
9. THE Attention_Module SHALL use an Idle_Limit of 60 s until the caller sets it.
10. IF the caller sets an Idle_Limit below 60 s, THEN THE Attention_Module SHALL use an Idle_Limit of 60 s.
11. IF the caller sets an Idle_Limit that is not a finite number, THEN THE Attention_Module SHALL ignore the value and keep the previous Idle_Limit.
12. FOR ALL finite Idle_Limit values set by the caller, THE Attention_Module SHALL use the greater of that value and 60 s.
13. WHILE the app is in Camera_Mode, THE Attention_Module SHALL derive the Attention_Signal without using Idle_Time, and SHALL apply the Idle_Limit only in Fallback_Mode.

### Requirement 7: Protect Privacy of Camera Data

**User Story:** As a reader, I want my camera images to stay on my device and never be kept, so that I can trust the app in my room.

#### Acceptance Criteria

1. THE Attention_Module SHALL process every Frame on the reader's device and SHALL send zero Frames, landmarks, or Pose_Samples in any network request.
2. WHEN landmark detection on a Frame completes or fails, THE Attention_Module SHALL release all references to that Frame before the next Frame is captured, and SHALL NOT write the Frame to local storage, IndexedDB, or console output.
3. THE Attention_Module SHALL NOT write landmarks or Pose_Samples to local storage, IndexedDB, or console output.
4. THE Attention_Module SHALL load the face-detection model file and its runtime files only from the app's own origin, and SHALL make zero requests to any other origin for these files.
5. WHEN the camera stops, THE Attention_Module SHALL stop every media track and release the detector within 1000 ms.
6. WHILE the camera is on, THE Attention_Module SHALL NOT display the video feed or any Frame in any visible element on any screen, including the Calibration screen.
7. IF the face detector fails to load or fails during detection, THEN THE Attention_Module SHALL enter Fallback_Mode, stop all media tracks within 1000 ms, show exactly one on-screen notice stating that face detection stopped and that reading continues, and SHALL preserve the current reading position and session data.
8. WHILE the camera is on, THE Attention_Module SHALL show a visible camera-on indicator on every screen, including the Calibration screen.

### Requirement 8: Pause and Resume Attention Tracking

**User Story:** As a reader, I want to leave the screen while tracking is paused without penalty, so that rest never counts against me.

#### Acceptance Criteria

1. THE Attention_Module SHALL provide `pause()` and `resume()` operations that a later spec, "discipline-loop", can call.
2. WHILE the Attention_Module is in Paused_State, THE Attention_Module SHALL emit only `present` Attention_Signals, regardless of face presence, head pose, tab visibility, window focus, or Idle_Time.
3. WHEN `pause()` is called and the most recent Attention_Signal was `away`, THE Attention_Module SHALL emit a `present` Attention_Signal within 1000 ms.
4. WHEN `resume()` is called, THE Attention_Module SHALL reset its away-time accumulator to 0 ms and Idle_Time to 0 ms, and SHALL evaluate attention from the `resume()` timestamp onward, with no away time carried over from before or during the Paused_State.
5. IF `pause()` or `resume()` is called while the Attention_Module is not running, or `pause()` is called while already in Paused_State, or `resume()` is called while not in Paused_State, THEN THE Attention_Module SHALL treat the call as a no-op that throws no error and emits no Attention_Signal.
6. WHEN a Session ends, THE Attention_Module SHALL stop the camera, clear all timers, and remove all subscriptions within 1000 ms.
7. WHEN the reader leaves the reading view, THE Attention_Module SHALL stop emitting Attention_Signals and SHALL stop the camera within 1000 ms.
8. IF the Attention_Module is in Paused_State when a Session ends or the reader leaves the reading view, THEN THE Attention_Module SHALL leave Paused_State and perform the same shutdown as in criteria 6 and 7.
9. FOR ALL event sequences containing a paused interval, THE Attention_Module SHALL emit no `away` signal with a timestamp inside that interval, where the interval includes both the `pause()` and `resume()` timestamps.
10. WHILE the Attention_Module is in Paused_State, THE Attention_Module SHALL count a reader who leaves the screen as present, and SHALL NOT treat leaving the screen as a breach.
11. WHILE the camera is on and the Attention_Module is in Paused_State, THE Camera_Indicator SHALL remain visible.

### Requirement 9: Remain Usable Without the Camera

**User Story:** As a reader who prefers no camera, I want everything in the app to work without it, so that I never feel forced.

#### Acceptance Criteria

1. WHILE the camera is off, THE Attention_Module SHALL provide the Attention_Signal through Fallback_Mode, using tab-visibility and idle detection, and every reading function (upload, paragraph reveal, progress, pace timer, chapter end) SHALL remain available.
2. WHEN the reader turns the camera on or off from the Settings_Screen, THE Attention_Module SHALL switch modes within 1000 ms and keep the last Attention_Signal value until the new mode produces a different one.
3. THE Settings_Screen SHALL provide a camera on/off control and a "Recalibrate" control, both reachable with Tab and operable with Enter or Space, with a visible focus ring on each.
4. WHEN the Attention_Module loads or unloads, THE Attention_Module SHALL allow the reading view to render without waiting for the load or unload to finish, and the reading view's first paint SHALL NOT be delayed by more than 100 ms because of it.
5. WHEN the Attention_Signal changes, THE Attention_Module SHALL leave keyboard focus on the element that held it before the change.
6. WHEN the reader turns the camera off, THE Attention_Module SHALL stop all camera tracks and hide the camera-on indicator within 1000 ms.

### Requirement 10: Signal Behaviour Properties for Downstream Haunts

**User Story:** As a developer of the haunt engine, I want guarantees about the signal's timing, so that haunts never start from a brief glance and always retreat when the reader returns.

#### Acceptance Criteria

1. FOR ALL Pose_Sample sequences in which every continuous period without a facing-the-screen sample is shorter than the Debounce_Time, THE Attention_Module SHALL emit no `away` signal.
2. WHEN a Pose_Sample shows the reader facing the screen while the Attention_Signal is `away`, THE Attention_Module SHALL emit `present` within the Return_Time of that sample's timestamp, where the Return_Time is at most 1000 milliseconds.
3. WHEN the Attention_Signal changes from `away` to `present`, THE Attention_Module SHALL emit exactly one `present` signal, with a timestamp, and no other signal between the last `away` and that `present`.
4. THE Attention_Module SHALL document in `src/attention/index.ts` that the haunt engine must treat each `present` signal as a reset to haunt level 0.
5. IF the Pose_Sample sequence is empty or contains a single sample, THEN THE Attention_Module SHALL emit no `away` signal.

### Requirement 11: Limit Face Detection Rate and Pause It While the Tab Is Hidden

**User Story:** As a reader, I want the app to use little processing power and no camera analysis while I am on another tab, so that my device stays quiet and my battery lasts.

#### Acceptance Criteria

1. WHILE the camera is on, THE Attention_Module SHALL start consecutive face-detection calls at least 100 ms apart, which is at most 10 detections per second.
2. WHILE the tab is hidden, THE Attention_Module SHALL make zero face-detection calls.
3. WHEN the tab becomes visible while the camera is on, THE Attention_Module SHALL resume face detection within 200 ms, and SHALL treat the face as not found until the first detection after resuming completes.
4. WHILE the camera is on and face detection is paused because the tab is hidden, THE Camera_Indicator SHALL remain visible.
5. WHILE the camera is on and the tab is hidden, THE Attention_Module SHALL count the hidden time toward `away` as defined in Requirement 4, criteria 3 and 16.
6. FOR ALL sequences of frame-ready times, THE Attention_Module SHALL start no two face-detection calls less than 100 ms apart.

## Note for the Task List

Tasks derived from these requirements must be ordered so the core signal works end to end first. The first tasks, in this order: the Decision_Function, the camera adapter, Fallback_Mode, the Camera_Consent_Dialog, the Camera_Indicator, and wiring into the reading view with a temporary on-screen `present` / `away` label. Calibration and the Settings_Screen come after that core path works.
