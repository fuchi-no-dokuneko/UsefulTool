@daily @uat @web
Feature: Daily acceptance of UsefulTool
  The daily laptop verifies every tool family with local text, image, PDF,
  download, persistence, offline, and peer-to-peer workflows.

  Scenario: Navigate every tool and retain theme choice in offline-capable pages
    Given I open the web application at path "/"
    Then the web page title contains "UsefulTool"
    And exactly 13 elements match CSS ".hero .actions a"
    And exactly 13 elements match CSS ".tools article"
    And JavaScript expression "document.querySelectorAll('.tools a[download][href^=\"offline/\"]').length === 13" returns true
    And JavaScript expression "Array.from(document.querySelectorAll('.hero .actions a')).every((link) => document.querySelector('.tools a[href=\"' + link.getAttribute('href') + '\"]'))" returns true
    And CSS "[data-theme-toggle]" is visible
    When I remember JavaScript expression "document.documentElement.dataset.theme" as "original theme"
    And I click CSS "[data-theme-toggle]"
    Then JavaScript expression "document.documentElement.dataset.theme" does not equal remembered value "original theme"
    When I remember JavaScript expression "document.documentElement.dataset.theme" as "selected theme"
    And I open the web application at path "/calculator.html"
    Then JavaScript expression "document.documentElement.dataset.theme" equals remembered value "selected theme"
    When I open the web application at path "/offline/calculator.html"
    Then the web page title contains "Calculator"
    And CSS "#result" contains text "1"
    And JavaScript expression "typeof UsefulToolTheme.current === 'function' && typeof UsefulTool.download === 'function'" returns true

  Scenario: Calculate expressions and convert affine units
    Given I open the web application at path "/calculator.html"
    Then CSS "#result" contains text "1"
    When I replace CSS "#expression" with "2+3*4"
    Then CSS "#result" has text "14"
    When I click CSS "#degMode"
    And I replace CSS "#expression" with "sin(30)"
    Then CSS "#result" has text "0.5"
    When I replace CSS "#integrand" with "x^2"
    And I replace CSS "#lower" with "0"
    And I replace CSS "#upper" with "3"
    And I replace CSS "#intervals" with "999"
    And I click CSS "#integrateButton"
    Then CSS "#integralResult" has text "9"
    And CSS "#intervals" has value "1000"
    When I open the web application at path "/unit-converter.html"
    Then JavaScript expression "Object.keys(UsefulToolUnits.categories).length === 18" returns true
    When I choose value "Temperature" in CSS "#category"
    And I replace CSS "#value" with "100"
    And I choose value "celsius" in CSS "#fromUnit"
    And I choose value "fahrenheit" in CSS "#toUnit"
    Then CSS "#mainResult" has text "212"
    And CSS "#formula" contains text "Temperature uses celsius"
    When I replace CSS "#value" with "not-a-number"
    Then CSS "#mainResult" contains text "Invalid number"

  Scenario: Round-trip Base64 and reversible ROT transformations
    Given I open the web application at path "/base64-converter.html"
    When I replace CSS "#input" with "Useful Tool"
    And I click CSS "#encodeButton"
    Then CSS "#output" has value "VXNlZnVsIFRvb2w="
    And CSS "#status" contains text "Encoded 11 B."
    When I click CSS "#useOutputButton"
    And I click CSS "#decodeButton"
    Then CSS "#output" has value "Useful Tool"
    And CSS "#byteView" contains text "UTF-8 preview"
    And CSS "#downloadButton" is enabled
    When I click CSS "#downloadButton"
    Then a downloaded file matching "base64-decoded*.bin" appears
    When I replace CSS "#input" with "%%%"
    And I click CSS "#decodeButton"
    Then CSS "#status" contains text "Invalid Base64"
    When I open the web application at path "/rot-cipher.html"
    And I replace CSS "#input" with "Hello, Z!"
    And I replace CSS "#shift" with "13"
    And I click CSS "#runButton"
    Then CSS "#output" has value "Uryyb, M!"
    When I click CSS "#swapButton"
    And I choose value "decode" in CSS "#direction"
    And I click CSS "#runButton"
    Then CSS "#output" has value "Hello, Z!"
    When I click CSS "#bruteButton"
    Then JavaScript expression "document.getElementById('allShifts').textContent.split(String.fromCharCode(10)).length === 26" returns true
    When I replace CSS "#passwordLength" with "32"
    And I click CSS "#generateButton"
    Then JavaScript expression "document.getElementById('input').value.length === 32 && document.getElementById('output').value.length === 32" returns true

  Scenario: Manage editor drafts format text preview Markdown and hand off to diff
    Given I open the web application at path "/word-count.html"
    Then exactly 1 elements match CSS "#draftSelect option"
    And JavaScript expression "!document.getElementById('editorFrame').classList.contains('no-lines')" returns true
    When I replace CSS "#draftName" with "Primary"
    And I replace CSS "#text" with:
      """
      alpha cat
      beta cat
      """
    Then CSS "#words" contains text "4"
    When I replace CSS "#findPattern" with "cat"
    And I replace CSS "#replaceValue" with "dog"
    And I click CSS "#replaceAll"
    Then CSS "#status" contains text "Replaced 2 matches."
    And CSS "#text" has value:
      """
      alpha dog
      beta dog
      """
    When I click CSS "#newDraft"
    Then exactly 2 elements match CSS "#draftSelect option"
    When I replace CSS "#draftName" with "Second"
    And I replace CSS "#text" with "second draft"
    And I execute JavaScript:
      """
      const select = document.getElementById('draftSelect');
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      """
    Then JavaScript expression "document.getElementById('text').value.includes('alpha dog')" returns true
    When I reload the web page
    Then JavaScript expression "document.getElementById('text').value.includes('alpha dog')" returns true
    And exactly 2 elements match CSS "#draftSelect option"
    When I upload acceptance fixture "draft-key.json" to CSS "#keyFile"
    Then CSS "#status" eventually contains text "Imported 1 draft."
    And CSS "#text" has value "Imported key text"
    When I choose value "json" in CSS "#mode"
    And I replace CSS "#text" with "{\"b\":1,\"a\":[2,3]"
    And I click CSS "#format"
    Then CSS "#status" contains text "Formatted as json."
    And JavaScript expression "document.getElementById('text').value.split(String.fromCharCode(10)).length > 1 && document.getElementById('text').value.includes(`\"b\": 1`)" returns true
    When I choose value "markdown" in CSS "#mode"
    And I replace CSS "#draftName" with "Acceptance"
    And I replace CSS "#text" with "# Preview title\n\nA **local** preview."
    And I name the current browser window "editor"
    And I click CSS "#previewMarkdown"
    And I switch to the newest browser window
    Then the web page title contains "Markdown Preview"
    And CSS "body" contains text "Preview title"
    When I switch to browser window "editor"
    And I click CSS "#toggleLines"
    Then JavaScript expression "document.getElementById('editorFrame').classList.contains('no-lines')" returns true
    When I click CSS "#downloadText"
    Then a downloaded file matching "Acceptance*.txt" appears
    When I click CSS "#downloadReport"
    Then a downloaded file matching "usefultool-word-count*.txt" appears
    When I click CSS "#downloadKey"
    Then a downloaded file matching "usefultool-text-editor-key*.json" appears
    When I click CSS "#sendLeft"
    And I switch to the newest browser window
    Then the web path ends with "file-diff.html"
    And JavaScript expression "document.getElementById('leftText').value.includes('Preview title')" returns true
    And CSS checkbox "#inlineWordDiff" is checked
    When I replace CSS "#rightText" with "# Preview heading\n\nA local preview plus one line."
    And I click CSS "#compareButton"
    Then at least 1 elements match CSS ".inline-removed"
    And at least 1 elements match CSS ".inline-added"
    And CSS "#patchButton" is enabled
    When I set CSS checkbox "#inlineWordDiff" to unchecked
    And I click CSS "#compareButton"
    Then no elements match CSS ".inline-removed"
    And no elements match CSS ".inline-added"
    When I click CSS "#patchButton"
    Then a downloaded file matching "comparison*.patch" appears
    When I reload the web page
    Then JavaScript expression "document.getElementById('rightText').value.includes('Preview heading')" returns true

  Scenario: Upload persist download and send a text file to the editor
    Given I open the web application at path "/text-transfer.html"
    When I upload acceptance fixture "sample.txt" to CSS "#file"
    Then CSS "#status" eventually contains text "Loaded sample.txt."
    And JavaScript expression "document.getElementById('transferText').value.includes('UsefulTool acceptance text')" returns true
    And the numeric text in CSS "#characters" is greater than 0
    When I reload the web page
    Then JavaScript expression "document.getElementById('transferText').value.includes('UsefulTool acceptance text')" returns true
    And CSS "#filename" has value "sample.txt"
    When I click CSS "#download"
    Then a downloaded file matching "sample*.txt" appears
    When I name the current browser window "transfer"
    And I click CSS "#openEditor"
    And I switch to the newest browser window
    Then the web path ends with "word-count.html"
    And JavaScript expression "document.getElementById('text').value.includes('UsefulTool acceptance text')" returns true

  Scenario: Remove an image background and inspect and rewrite PNG metadata
    Given I open the web application at path "/image-converter.html"
    When I upload acceptance fixture "sample.png" to CSS "#fileInput"
    Then CSS "#statusText" eventually contains text "Image loaded."
    And CSS "#canvas" is visible
    When I remember the pixel checksum of CSS canvas "#canvas"
    And I click CSS "#removeButton"
    Then CSS "#statusText" contains text "Background removal applied."
    And the pixel checksum of CSS canvas "#canvas" is different
    When I click CSS "#restoreMode"
    Then CSS "#restoreMode" has attribute "aria-pressed" equal to "true"
    When I click CSS "#downloadButton"
    Then CSS "#statusText" eventually contains text "Image exported."
    And a downloaded file matching "usefultool-image*.png" appears
    When I open the web application at path "/metadata-lab.html"
    And I upload acceptance fixture "sample.png" to CSS "#fileInput"
    Then CSS "#facts" eventually contains text "Detected format"
    And CSS "#facts" contains text "PNG"
    And CSS "#metadataList" contains text "IHDR"
    When I click CSS "#injectMode"
    And I replace CSS "#note" with "Local acceptance note"
    And I click CSS "#runButton"
    Then CSS "#metadataList" eventually contains text "PNG tEXt chunk injected"
    And CSS "#downloadButton" is enabled
    When I click CSS "#downloadButton"
    Then a downloaded file matching "metadata-injected*.png" appears
    When I click CSS "#eraseMode"
    And I click CSS "#runButton"
    Then CSS "#metadataList" eventually contains text "Image metadata erased"
    When I click CSS "#downloadButton"
    Then a downloaded file matching "metadata-erased*.png" appears

  Scenario: Edit image layers create a PDF and merge selected PDF pages
    Given I open the web application at path "/image-editor.html"
    Then JavaScript expression "document.documentElement.dataset.editorReady === 'true'" eventually returns true
    When I upload acceptance fixture "sample.png,sample-alt.png" to CSS "#imageInput"
    Then CSS "#status" eventually contains text "2 layer(s) loaded."
    And exactly 2 elements match CSS "#layers .layer-button"
    When I click CSS "#duplicate"
    Then exactly 3 elements match CSS "#layers .layer-button"
    When I replace CSS "#angle" with "45"
    And I replace CSS "#canvasWidth" with "640"
    And I replace CSS "#canvasHeight" with "480"
    And I click CSS "#resizeCanvas"
    Then JavaScript expression "UsefulToolImageEditor.canvas.width === 640 && UsefulToolImageEditor.canvas.height === 480 && Math.round(UsefulToolImageEditor.canvas.getActiveObject().angle) === 45" returns true
    When I click CSS "#exportButton"
    Then CSS "#status" contains text "Exported PNG"
    And a downloaded file matching "usefultool-canvas*.png" appears
    When I open the web application at path "/images-to-pdf.html"
    And I upload acceptance fixture "sample.png,sample-alt.png" to CSS "#imageInput"
    Then CSS "#status" eventually contains text "2 image(s) ready."
    And exactly 2 elements match CSS "#imageList .image-row"
    When I set CSS checkbox "#caption" to checked
    And I click CSS "#buildButton"
    Then CSS "#status" eventually contains text "Created 2 page(s)"
    And a downloaded file matching "usefultool-images*.pdf" appears
    When I open the web application at path "/pdf-merge.html"
    And I upload acceptance fixture "one-page.pdf,two-page.pdf" to CSS "#pdfInput"
    Then CSS "#status" eventually contains text "2 PDF file(s) ready."
    And exactly 2 elements match CSS "#pdfList .pdf-row"
    When I replace CSS "#pdfList .pdf-row:first-child input" with "1"
    And I replace CSS "#pdfList .pdf-row:last-child input" with "2-1"
    And I click CSS "#pdfList .pdf-row:last-child button:first-of-type"
    And I click CSS "#mergeButton"
    Then CSS "#status" eventually contains text "Merged 3 page(s)"
    And a downloaded file matching "usefultool-merged*.pdf" appears

  Scenario: Exchange text and an image through a local WebRTC peer channel
    Given I open the web application at path "/lan-chat.html"
    When I name the current browser window "host"
    And I replace CSS "#displayName" with "Host"
    And I click CSS "#hostButton"
    Then CSS "#signalOutput" eventually has a non-empty value
    And CSS "#connectionStatus" eventually contains text "Invite ready."
    And JavaScript expression "!document.getElementById('signalOutput').value.includes('::')" returns true
    When I remember the value of CSS "#signalOutput" as "offer"
    And I open path "/lan-chat.html" in a new browser window named "peer"
    And I replace CSS "#displayName" with "Peer"
    And I replace CSS "#signalInput" with remembered value "offer"
    And I click CSS "#joinButton"
    Then CSS "#signalOutput" eventually has a non-empty value
    And CSS "#connectionStatus" eventually contains text "Answer ready."
    And JavaScript expression "!document.getElementById('signalOutput').value.includes('::')" returns true
    When I remember the value of CSS "#signalOutput" as "answer"
    And I switch to browser window "host"
    And I replace CSS "#signalInput" with remembered value "answer"
    And I click CSS "#applyAnswerButton"
    Then CSS "#connectionStatus" eventually contains text "1 connected peer(s)."
    When I replace CSS "#messageInput" with "local peer message"
    And I click CSS "#sendButton"
    Then CSS "#chatLog" contains text "local peer message"
    When I upload acceptance fixture "sample.png" to CSS "#imageInput"
    And I click CSS "#sendImageButton"
    And I switch to browser window "peer"
    Then CSS "#connectionStatus" eventually contains text "1 connected peer(s)."
    And CSS "#chatLog" eventually contains text "local peer message"
    And at least 1 elements match CSS "#chatLog img"
    When I click CSS "#disconnectButton"
    Then CSS "#connectionStatus" eventually contains text "0 connected peer(s)."
