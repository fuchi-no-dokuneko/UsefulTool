@demo @english @web
Feature: English key-feature demonstration of UsefulTool

  Scenario: Tour local tools edit text compare changes and build a PDF
    Given I begin a recorded demo
    And I open the web application at path "/"
    When I narrate in "en-US" for at least 8 seconds:
      """
      UsefulTool is a collection of thirteen browser utilities. Every tool processes data locally, supports dark and light themes, and provides a downloadable standalone HTML version for offline use.
      """
    Then exactly 13 elements match CSS ".tools article"
    When I open the web application at path "/calculator.html"
    And I replace CSS "#expression" with "2+3*4"
    Then CSS "#result" has text "14"
    When I narrate in "en-US" for at least 7 seconds:
      """
      The calculator handles normal expressions, scientific functions, angle modes, history, and numerical integration. The related converter covers eighteen unit categories.
      """
    And I open the web application at path "/word-count.html"
    And I replace CSS "#text" with:
      """
      release cat
      review cat
      """
    Then CSS "#words" contains text "4"
    When I replace CSS "#findPattern" with "cat"
    And I replace CSS "#replaceValue" with "dog"
    And I click CSS "#replaceAll"
    Then CSS "#status" contains text "Replaced 2 matches."
    When I narrate in "en-US" for at least 7 seconds:
      """
      The lightweight editor counts text, manages multiple autosaved drafts, supports regular-expression replacement and best-effort code formatting, previews Markdown, and exports text, reports, and a portable draft key.
      """
    And I reload the web page
    Then CSS "#text" has value:
      """
      release dog
      review dog
      """
    When I click CSS "#sendLeft"
    And I switch to the newest browser window
    Then the web path ends with "file-diff.html"
    When I replace CSS "#rightText" with:
      """
      release fox
      review dog
      """
    And I click CSS "#compareButton"
    Then at least 1 elements match CSS ".inline-added"
    When I narrate in "en-US" for at least 8 seconds:
      """
      Send to diff opens the comparison tool with the edited text already on the left. Changed words use graded red and green highlights by default, and that option can be switched off.
      """
    When I open the web application at path "/images-to-pdf.html"
    And I upload acceptance fixture "sample.png,sample-alt.png" to CSS "#imageInput"
    Then CSS "#status" eventually contains text "2 image(s) ready."
    When I set CSS checkbox "#caption" to checked
    And I click CSS "#buildButton"
    Then CSS "#status" eventually contains text "Created 2 page(s)"
    And a downloaded file matching "usefultool-images*.pdf" appears
    When I narrate in "en-US" for at least 9 seconds:
      """
      Image tools remove backgrounds, inspect privacy metadata, edit layers, and build PDFs. Separate Base64, ROT, text transfer, PDF merge, and peer-to-peer LAN chat tools round out the offline-first workspace.
      """
    Then I finish the recorded demo
