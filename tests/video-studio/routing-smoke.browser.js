window.checkDesktopSound = async function (frame, api, check) {
  const w = frame.contentWindow, d = w.document;
  const oldWidth = frame.width, hidden = frame.hidden;
  frame.width = '1363'; frame.hidden = false;
  try {
    const audio = api.project.items.find(item => item.audio);
    api.selectItem(audio.id, false);
    const lanes = [...d.querySelectorAll('.audio-waveform-lane strong')];
    check('desktop audio exposes both labelled output waveforms', lanes.map(e => e.textContent).join('|') === 'L — Left|R — Right');
    for (const [preset, mode] of [['channelLeft','leftOnly'],['channelRight','rightOnly']]) {
      d.querySelector('#contextPanel button[data-help-id="'+preset+'"]').click();
      check('desktop '+mode+' preset routes the selected sound', api.selectedItem.audio.channelMode === mode);
      for (const key of ['leftGain','rightGain']) {
        const control = d.querySelector('#contextPanel [data-control="'+key+'"]');
        control.value = 65;
        control.dispatchEvent(new w.Event('input', {bubbles:true}));
        control.dispatchEvent(new w.Event('change', {bubbles:true}));
        check('raising '+key+' overrides '+mode+' to custom', api.selectedItem.audio.channelMode === 'custom' && api.selectedItem.audio[key] === .65);
      }
    }
    d.querySelector('#contextPanel button[data-help-id="channelStereo"]').click();
    check('Stereo restores both outputs after manual levels', api.selectedItem.audio.leftGain === 1 && api.selectedItem.audio.rightGain === 1);
  } finally { frame.width = oldWidth; frame.hidden = hidden; }
};
