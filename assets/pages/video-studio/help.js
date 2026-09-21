// @ts-check
/* All interactive controls are created through this registry-backed factory. */
(function () {
  "use strict";
  const HELP_CONTENT = {
    addVideos: [
      "Add videos",
      "Choose video files. They are placed at the end of Main video.",
    ],
    addMusic: [
      "Add music",
      "Add an MP3 as background music or place it at the current moment.",
    ],
    addImages: [
      "Add images",
      "Add pictures to the movie or place them over a video.",
    ],
    startArrange: [
      "Start arranging",
      "Open the timeline with imported videos arranged in order.",
    ],
    play: [
      "Play movie",
      "Preview the movie from the current moment. Space also plays or pauses.",
    ],
    pause: [
      "Pause movie",
      "Keep the current frame visible for editing. Space also plays or pauses.",
    ],
    backOneSecond: ["Move back", "Move the current moment one second earlier."],
    forwardOneSecond: [
      "Move forward",
      "Move the current moment one second later.",
    ],
    cutHere: [
      "Cut at this moment",
      "Turn the selected item into two editable pieces. Press S to cut.",
    ],
    shortenStart: [
      "Change the start",
      "Drag to choose where this item begins. Arrow keys trim by one frame.",
    ],
    shortenEnd: [
      "Change the end",
      "Drag to choose where this item finishes. Arrow keys trim by one frame.",
    ],
    addOnTop: [
      "Add something over the video",
      "Add video, text, an image, or a blur effect above the main video.",
    ],
    videoOverlay: [
      "Put video on top",
      "Place another video over the main video for an overlap effect.",
    ],
    visibility: [
      "Change visibility",
      "Lower the value to see more of the video underneath. Equal mix normalizes the active video weights.",
    ],
    groovyTriple: [
      "Create a triple image",
      "Overlap three videos with fixed visibility, position, and colour offsets.",
    ],
    softOverlap: [
      "Soft overlap",
      "Blend the top video at 55% visibility. You can change the result afterward.",
    ],
    ghostTrail: [
      "Ghost trail",
      "Offset overlapping videos to create translucent repeated images.",
    ],
    equalMix: [
      "Equal mix",
      "Give each overlapping video the same contribution. Adjust weights or add curve points to change the mix.",
    ],
    addText: ["Add text", "Place a title, label, or subtitle over the movie."],
    addImage: [
      "Add an image",
      "Place a picture or transparent PNG over the movie.",
    ],
    blurArea: [
      "Add blur",
      "Blur a movable rectangle on a layer or everything below it for a selected time range.",
    ],
    moveFront: [
      "Move forward",
      "Show this item in front of the item above it.",
    ],
    moveBehind: ["Move backward", "Place this item behind the item below it."],
    lockItem: [
      "Lock this item",
      "Keep its time, size, and position fixed during editing.",
    ],
    muteItem: [
      "Mute this sound",
      "Keep the sound item on the timeline with zero output volume.",
    ],
    speed: [
      "Change playback speed",
      "A higher value shortens playback and a lower value extends it. Sound can have its own speed.",
    ],
    unlinkAudio: [
      "Edit sound separately",
      "Allow picture and sound to move and change independently.",
    ],
    undo: [
      "Undo last change",
      "Return the project to its previous editing state. Ctrl+Z or Command+Z.",
    ],
    redo: [
      "Redo change",
      "Apply the latest undone change again. Ctrl+Y or Command+Shift+Z.",
    ],
    deleteItem: [
      "Delete selected item",
      "Remove the selected item and provide an eight-second Undo action. Delete key.",
    ],
    exportVideo: [
      "Create the video file",
      "Combine the visible picture and sound into one downloadable video.",
    ],
    cancelExport: [
      "Stop export",
      "Stop the current export and keep the project available for editing.",
    ],
    downloadVideo: [
      "Save the finished video",
      "Download the exported video file to the device.",
    ],
    projectMenu: [
      "Project",
      "Create, open or save a project. Project files keep editable settings and media fingerprints.",
    ],
    newProject: [
      "New project",
      "Start an empty movie after choosing whether to save the current project.",
    ],
    openProject: [
      "Open project",
      "Load an editable .utvproj file. Relink original media if it is unavailable in this session.",
    ],
    saveProject: [
      "Save project",
      "Download an editable .utvproj file with the current timeline and settings.",
    ],
    saveCopy: [
      "Save a copy",
      "Download a separate project copy with a new project identity.",
    ],
    projectName: [
      "Name your movie",
      "Change the project name used for project files and exported videos.",
    ],
    home: [
      "Home",
      "Open the UsefulTool home page. Your current session is saved on this device.",
    ],
    offline: [
      "Offline studio",
      "Download this editor as one HTML file that can be opened locally.",
    ],
    help: [
      "Studio guide",
      "Read the four steps and keyboard shortcuts for making your movie.",
    ],
    touchHelp: [
      "Control explanation",
      "Read what this control does and what happens when you use it.",
    ],
    mediaStep: [
      "Add media",
      "Choose the videos, music and pictures for your movie.",
    ],
    arrangeStep: [
      "Arrange",
      "Reorder, shorten or cut the items on your timeline.",
    ],
    effectsStep: [
      "Add effects",
      "Place videos, text, images and blur over your movie, or change its look.",
    ],
    exportStep: [
      "Export",
      "Review the complete movie and choose the quality of the download.",
    ],
    mediaTab: [
      "Media category",
      "Show imported videos, music or images in the media library.",
    ],
    selectAsset: [
      "Choose media",
      "Select this file to add it to the timeline or an overlay.",
    ],
    addHere: [
      "Add here",
      "Choose a library item and insert it at this position on Main video.",
    ],
    addToMovie: ["Add to movie", "Append this picture or video to Main video."],
    selectItem: [
      "Select an item",
      "Show this item's position, time range and editable settings.",
    ],
    duplicateItem: [
      "Duplicate item",
      "Add an editable copy after the selected item.",
    ],
    moveItem: [
      "Move item",
      "Drag the item along the timeline. Videos can also move between the three video tracks.",
    ],
    resizeItem: [
      "Resize the selection",
      "Drag a handle to change this item's size. Arrow keys make small adjustments.",
    ],
    moveSelection: [
      "Move the selection",
      "Drag the selected rectangle to change its position in the preview. Arrow keys move by one pixel.",
    ],
    seek: [
      "Choose a moment",
      "Move the playhead to preview and edit a different moment in the movie.",
    ],
    fullscreen: [
      "Fullscreen preview",
      "Expand the preview to fill the screen. Escape leaves fullscreen.",
    ],
    previewMute: [
      "Preview sound",
      "Turn the preview speaker on or off. Exported sound is controlled in Export settings.",
    ],
    zoom: [
      "Timeline zoom",
      "Show more detail or more of the movie without changing any edit.",
    ],
    frameBack: [
      "Previous frame",
      "Move the playhead back by one output frame.",
    ],
    frameForward: [
      "Next frame",
      "Move the playhead forward by one output frame.",
    ],
    expandSound: [
      "Show sound",
      "Expand or collapse the independent sound clips and waveforms.",
    ],
    layerSettings: [
      "Layer settings",
      "Rename, show, lock, mute, solo or reorder this layer.",
    ],
    showItem: [
      "Show item",
      "Include this item in the preview and export, or temporarily hide it.",
    ],
    showLayer: [
      "Show layer",
      "Include this layer in preview and export, or temporarily hide it.",
    ],
    soloLayer: [
      "Solo layer",
      "Preview and export only soloed layers in this picture or sound group.",
    ],
    renameLayer: [
      "Rename layer",
      "Give this layer a name that describes its contents.",
    ],
    startsAt: ["Starts at", "Set the exact movie time when this item starts."],
    endsAt: ["Ends at", "Set the exact movie time when this item ends."],
    sourceIn: [
      "Source in",
      "Choose the first moment used from the original media file.",
    ],
    sourceOut: [
      "Source out",
      "Choose the last moment used from the original media file.",
    ],
    itemName: [
      "Item name",
      "Give this timeline item a name without renaming the source file.",
    ],
    positionX: [
      "Horizontal position",
      "Set the item's horizontal position in project pixels.",
    ],
    positionY: [
      "Vertical position",
      "Set the item's vertical position in project pixels.",
    ],
    width: ["Width", "Set the item's width in project pixels."],
    height: ["Height", "Set the item's height in project pixels."],
    rotation: [
      "Rotation",
      "Rotate the picture, text or blur region around its centre.",
    ],
    fit: [
      "Fit in frame",
      "Keep the entire picture visible with its original proportions.",
    ],
    fill: [
      "Fill the frame",
      "Enlarge the picture until it covers the whole frame.",
    ],
    originalSize: [
      "Original size",
      "Use the image's original pixel dimensions.",
    ],
    cropX: ["Crop left", "Choose the left edge of the source picture to use."],
    cropY: ["Crop top", "Choose the top edge of the source picture to use."],
    cropWidth: [
      "Crop width",
      "Choose how much of the original picture's width is visible.",
    ],
    cropHeight: [
      "Crop height",
      "Choose how much of the original picture's height is visible.",
    ],
    fadeIn: [
      "Fade in",
      "Gradually show this picture or raise this sound at the beginning.",
    ],
    fadeOut: [
      "Fade out",
      "Gradually hide this picture or lower this sound at the end.",
    ],
    textContent: [
      "Text content",
      "Type the words to show in the movie. New lines are preserved.",
    ],
    textPreset: [
      "Text preset",
      "Choose a title, caption or subtitle layout, then edit its appearance.",
    ],
    font: ["Font", "Choose a locally available font for the text."],
    fontSize: [
      "Text size",
      "Make the text larger or smaller in project pixels.",
    ],
    fontWeight: ["Text weight", "Choose regular or bold text."],
    color: ["Text colour", "Choose the colour of the text."],
    background: [
      "Background",
      "Choose a background colour. Transparent keeps the picture underneath visible.",
    ],
    alignment: [
      "Text alignment",
      "Align the text to the left, centre or right of its box.",
    ],
    addCredits: [
      "Add credits",
      "Add a rolling list, a static list or pages of credits to your movie.",
    ],
    creditsTemplate: [
      "Credits template",
      "Choose rolling credits, a static list or separate pages.",
    ],
    addGroup: ["Add credits group", "Add a heading and names to the credits."],
    groupTitle: [
      "Group title",
      "Name this credits group, such as Cast, Music or Thanks.",
    ],
    groupContent: ["Names", "Add one name or credit per line."],
    groupUp: ["Move group up", "Show this credits group earlier in the list."],
    groupDown: [
      "Move group down",
      "Show this credits group later in the list.",
    ],
    deleteGroup: [
      "Delete group",
      "Remove this heading and its names from the credits.",
    ],
    creditsMode: [
      "Credits timing",
      "Fit duration adjusts speed to the time range. Keep speed adjusts duration to fit all names.",
    ],
    creditsSpeed: [
      "Scrolling speed",
      "Set how many project pixels the credits move each second.",
    ],
    direction: [
      "Direction",
      "Choose which way this transition or scrolling effect moves.",
    ],
    marginTop: [
      "Top margin",
      "Set the space above the credits in project pixels.",
    ],
    marginBottom: [
      "Bottom margin",
      "Set the space below the credits in project pixels.",
    ],
    lineSpacing: ["Line spacing", "Adjust the gap between lines of text."],
    blurType: [
      "Blur type",
      "Choose Gaussian, Box, Motion or Radial blur for the selected rectangle.",
    ],
    blurAmount: ["Blur amount", "Increase the strength of the selected blur."],
    blurAngle: [
      "Motion angle",
      "Set the direction of motion blur from 0 to 360 degrees.",
    ],
    blurCenterX: [
      "Radial centre X",
      "Move the radial blur centre horizontally.",
    ],
    blurCenterY: ["Radial centre Y", "Move the radial blur centre vertically."],
    blurTarget: [
      "Blur target",
      "Blur the selected layer, or the complete picture below this filter.",
    ],
    targetLayer: [
      "Target layer",
      "Choose which picture layer this blur affects.",
    ],
    addEffect: [
      "Add an effect",
      "Apply brightness, contrast, saturation, grayscale, vintage or hue to the selected item.",
    ],
    brightness: [
      "Brightness",
      "Lighten or darken the selected picture during the effect's time range.",
    ],
    contrast: [
      "Contrast",
      "Increase or reduce the difference between light and dark areas.",
    ],
    saturation: ["Saturation", "Make the colours stronger or more muted."],
    grayscale: ["Grayscale", "Reduce colour toward a black-and-white picture."],
    sepia: ["Vintage", "Give the selected picture a warm sepia appearance."],
    hue: ["Hue", "Rotate the colours of the selected picture."],
    effectAmount: [
      "Effect strength",
      "Change how strongly this effect changes the picture.",
    ],
    effectStart: [
      "Effect starts",
      "Set when this effect begins, measured from the start of the item.",
    ],
    effectEnd: [
      "Effect ends",
      "Set when this effect stops, measured from the start of the item.",
    ],
    effectEnabled: [
      "Enable effect",
      "Turn this effect on or off without deleting its settings.",
    ],
    effectUp: [
      "Move effect earlier",
      "Apply this effect before the previous effect in the stack.",
    ],
    effectDown: [
      "Move effect later",
      "Apply this effect after the next effect in the stack.",
    ],
    duplicateEffect: [
      "Copy effect",
      "Add an independent copy of this effect and its settings.",
    ],
    deleteEffect: [
      "Delete effect",
      "Remove this effect from the selected item.",
    ],
    transition: [
      "Add a transition",
      "Choose how one main clip changes into the next. Overlap alone never adds a transition.",
    ],
    transitionType: [
      "Transition style",
      "Preview and select Crossfade, Fade through black, Wipe, Slide, Zoom or Dissolve.",
    ],
    transitionDuration: [
      "Transition duration",
      "Set a duration between 0.1 and 5 seconds, limited by both clips' available frames.",
    ],
    useMaximum: [
      "Use maximum",
      "Use the longest transition that fits the two adjacent clips.",
    ],
    easing: [
      "Interpolation",
      "Choose how the change accelerates between two values.",
    ],
    removeTransition: [
      "Remove transition",
      "Join these clips with a direct cut instead of a transition.",
    ],
    curvePoint: [
      "Add visibility point",
      "Set the visibility at this moment. The curve interpolates between your points.",
    ],
    pointTime: [
      "Point time",
      "Position this curve point relative to the beginning of the item.",
    ],
    pointValue: [
      "Point value",
      "Set visibility or mix weight at this curve point.",
    ],
    deletePoint: [
      "Delete curve point",
      "Remove this point and interpolate between the remaining points.",
    ],
    blendMode: [
      "Video blend",
      "Equal contribution combines normalized video weights. Layer alpha uses the visibility of each layer in order.",
    ],
    volume: ["Volume", "Set this sound's volume from 0 to 200 percent."],
    videoBalance: [
      "Video sound balance",
      "Adjust all original video sounds together from 0 to 200 percent.",
    ],
    musicBalance: [
      "Music balance",
      "Adjust all music clips together from 0 to 200 percent.",
    ],
    otherBalance: [
      "Other sound balance",
      "Adjust other independent sounds from 0 to 200 percent.",
    ],
    leftGain: [
      "Left output",
      "Set the left output from 0 to 100 percent. A custom mix with only one output enabled includes both source channels in that ear.",
    ],
    rightGain: [
      "Right output",
      "Set the right output from 0 to 100 percent. With both custom outputs enabled, the source's stereo channels remain separate.",
    ],
    channelStereo: ["Stereo", "Send the source's left and right channels to their matching ears at 100 percent."],
    channelLeft: ["Left only", "Mix both source channels to mono, then send the whole song to the left ear only."],
    channelRight: ["Right only", "Mix both source channels to mono, then send the whole song to the right ear only."],
    repeat: [
      "Repeat sound",
      "Repeat the selected source range until this sound item's end. Turn it off to leave silence after the source ends.",
    ],
    wholeMovie: [
      "Play for whole movie",
      "Loop the music through the movie and fade out during its final second.",
    ],
    startHere: [
      "Start here",
      "Place this sound at the current playhead position.",
    ],
    afterSound: [
      "After selected sound",
      "Place this music immediately after the selected sound item.",
    ],
    linkAudio: [
      "Link picture and sound",
      "Move, trim, cut and change speed together until linked editing is turned off.",
    ],
    preservePitch: [
      "Preserve pitch",
      "Keep the sound's pitch while changing its playback speed.",
    ],
    waveformZoom: [
      "Waveform zoom",
      "Enlarge the waveform display without changing its volume.",
    ],
    moreSettings: [
      "More settings",
      "Show precise timing, crop, stereo and other advanced controls.",
    ],
    autoMovie: [
      "Make a movie for me",
      "Choose media, a style, length and music to generate an editable movie draft.",
    ],
    autoTemplate: [
      "Movie style",
      "Choose Family, Travel, Fast, Calm or Music video to guide automatic editing.",
    ],
    targetLength: [
      "Target length",
      "Aim for 30 seconds, 60 seconds or all available footage.",
    ],
    backgroundMusic: [
      "Background music",
      "Choose imported music to loop under the generated movie.",
    ],
    generateMovie: [
      "Make the draft",
      "Measure scene changes and audio peaks, then create editable cuts, transitions and titles.",
    ],
    reviewMovie: [
      "Review movie",
      "Open Export to check the finished picture, sound and output quality.",
    ],
    quality: [
      "Export quality",
      "Quick uses 720p, Standard uses 1080p, and High keeps the original project size.",
    ],
    fps: [
      "Output frame rate",
      "Set the number of video frames recorded each second.",
    ],
    bitrate: [
      "Video bitrate",
      "Use more megabits per second for a larger file with more detail.",
    ],
    format: ["Output format", "Choose a video format this browser can record."],
    includeAudio: [
      "Include sound",
      "Record the mixed stereo sound in the exported video.",
    ],
    segmentInterval: [
      "Interval cuts",
      "Place cuts at this interval. All segments are exported in order into one ZIP, with no segment-count limit.",
    ],
    segmentCuts: [
      "Show interval cuts",
      "Show evenly spaced cut markers without changing your editable clips.",
    ],
    exportSegments: [
      "Export segments",
      "Stream every interval into one ZIP containing numbered video files. Cancel discards the incomplete archive; errors identify the affected segment.",
    ],
    downloadSegments: ["Download ZIP", "Download the single archive containing all numbered interval segments."],
    relink: [
      "Relink file",
      "Choose the original file matching the saved name, size and content fingerprint.",
    ],
    continueProject: [
      "Continue last project",
      "Restore this tab's saved edits and imported files.",
    ],
    apply: [
      "Apply",
      "Apply these choices to the project. You can undo the change afterward.",
    ],
    cancel: [
      "Cancel",
      "Close this panel and keep the project available for editing.",
    ],
    close: ["Close", "Close this panel and return to the editor."],
    fixConflict: [
      "Fix automatically",
      "Move conflicting clips to the next available time on their track.",
    ],
    shortenOverlay: [
      "Shorten an overlay",
      "Select an existing overlay so you can adjust its range and make room.",
    ],
    mediaDrawer: [
      "Media library",
      "Open or close the media library on a smaller screen.",
    ],
    contextDrawer: [
      "Editing controls",
      "Open or close the controls for the selected item.",
    ],
    audioLimit: [
      "Review overlapping sounds",
      "At most three sounds can play together, including video sound. Mute or move a sound to make room, then preview or export the movie.",
    ],
    fixAudioLimit: [
      "Mute extra sounds",
      "Mute unlocked overlapping sounds, starting from the last track, until at most three play together. Keep their clips for editing and undo this change at any time.",
    ],
  };
  /** @typedef {keyof typeof HELP_CONTENT} HelpId */
  /** @typedef {{ helpId: HelpId, label: string, onClick?: (event: MouseEvent) => void, disabled?: boolean, disabledReason?: string, className?: string, id?: string, icon?: boolean }} HelpButtonProps */
  /** @type {HTMLElement | null} */ let tooltip = null;
  /** @type {HTMLElement | null} */ let owner = null;
  let showTimer = 0,
    hideTimer = 0;
  function close() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    owner?.removeAttribute("aria-describedby");
    owner = null;
    if (tooltip) tooltip.hidden = true;
  }
  /** @param {HTMLElement} target @param {HelpId} helpId @param {string} [reason] */
  function show(target, helpId, reason) {
    close();
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "studio-tooltip";
      tooltip.className = "studio-tooltip";
      tooltip.setAttribute("role", "tooltip");
      document.body.appendChild(tooltip);
    }
    const entry = HELP_CONTENT[helpId];
    const title = document.createElement("strong"),
      description = document.createElement("span");
    title.textContent = entry[0];
    description.textContent = entry[1] + (reason ? " " + reason : "");
    tooltip.replaceChildren(title, description);
    tooltip.hidden = false;
    owner = target;
    target.setAttribute("aria-describedby", tooltip.id);
    const bounds = target.getBoundingClientRect(),
      tip = tooltip.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(
        innerWidth - tip.width - 12,
        bounds.left + bounds.width / 2 - tip.width / 2,
      ),
    );
    const top =
      bounds.top - tip.height - 8 >= 12
        ? bounds.top - tip.height - 8
        : Math.min(innerHeight - tip.height - 12, bounds.bottom + 8);
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(12, top) + "px";
  }
  /** @param {HTMLElement} target @param {HelpId} helpId @param {() => string} [reason] */
  function attach(target, helpId, reason = () => "") {
    if (!HELP_CONTENT[helpId])
      throw new Error("Every control needs a registered helpId: " + helpId);
    target.dataset.helpId = helpId;
    const currentId = () => /** @type {HelpId} */ (target.dataset.helpId);
    target.addEventListener("pointerenter", () => {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = window.setTimeout(
        () => show(target, currentId(), reason()),
        400,
      );
    });
    target.addEventListener("pointerleave", () => {
      clearTimeout(showTimer);
      hideTimer = window.setTimeout(close, 150);
    });
    target.addEventListener("focus", () => show(target, currentId(), reason()));
    target.addEventListener("blur", close);
    return target;
  }
  /** @param {HelpButtonProps} props @returns {HTMLSpanElement} */
  function button(props) {
    const {
      helpId,
      label,
      onClick,
      disabled = false,
      disabledReason = "",
      className = "",
      id,
      icon = false,
    } = props;
    const wrapper = document.createElement("span");
    wrapper.className = "help-wrap";
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    control.className = className + (icon ? " icon-button" : "");
    control.disabled = disabled;
    if (id) control.id = id;
    control.setAttribute("aria-label", label);
    control.dataset.disabledReason = disabledReason;
    const reason = () =>
      control.disabled ? control.dataset.disabledReason || "" : "";
    attach(control, helpId, reason);
    attach(wrapper, helpId, reason);
    if (disabled) {
      wrapper.tabIndex = 0;
      wrapper.setAttribute("aria-disabled", "true");
      wrapper.setAttribute("aria-label", label);
    }
    if (onClick) control.addEventListener("click", onClick);
    wrapper.appendChild(control);
    const info = document.createElement("button");
    info.type = "button";
    info.textContent = "ⓘ";
    info.className = "touch-help";
    info.setAttribute("aria-label", "About " + label);
    info.dataset.helpId = "touchHelp";
    info.addEventListener("click", (event) => {
      event.stopPropagation();
      show(info, /** @type {HelpId} */ (control.dataset.helpId), reason());
    });
    wrapper.appendChild(info);
    return wrapper;
  }
  /** @param {HelpId} helpId @param {string} text @param {() => string} [reason] */
  function label(helpId, text, reason) {
    const span = document.createElement("span");
    span.textContent = text;
    span.tabIndex = 0;
    return attach(span, helpId, reason);
  }
  /** @param {HTMLButtonElement} control @param {boolean} disabled @param {string} reason */
  function setDisabled(control, disabled, reason) {
    control.disabled = disabled;
    control.dataset.disabledReason = reason;
    const wrapper = control.parentElement;
    if (!wrapper?.classList.contains("help-wrap")) return;
    if (disabled) {
      wrapper.tabIndex = 0;
      wrapper.setAttribute("aria-disabled", "true");
      wrapper.setAttribute(
        "aria-label",
        control.getAttribute("aria-label") || "Unavailable action",
      );
    } else {
      wrapper.removeAttribute("tabindex");
      wrapper.removeAttribute("aria-disabled");
    }
  }
  /** @param {HTMLButtonElement} control @param {HelpId} helpId @param {string} label @param {string} [text] */
  function setButtonLabel(control, helpId, label, text = label) {
    control.dataset.helpId = helpId;
    control.textContent = text;
    control.setAttribute("aria-label", label);
    const wrapper = control.parentElement;
    if (wrapper) {
      wrapper.dataset.helpId = helpId;
      if (control.disabled) wrapper.setAttribute("aria-label", label);
      wrapper
        .querySelector(".touch-help")
        ?.setAttribute("aria-label", "About " + label);
    }
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (owner && event.target instanceof Node && !owner.contains(event.target))
      close();
  });
  // @ts-expect-error The application namespace is initialized by model.js.
  globalThis.UTStudio.Help = {
    HELP_CONTENT,
    button,
    attach,
    label,
    setDisabled,
    setButtonLabel,
    close,
  };
})();
