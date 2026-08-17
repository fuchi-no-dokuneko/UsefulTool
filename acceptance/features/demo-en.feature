@demo @english @web
Feature: English key-feature demonstration of UsefulTool Text Editor

  Scenario: Replace text, preserve the draft, and send it to File Diff
    Given I begin a recorded demo
    And I open the web application at path "/word-count.html"
    When I narrate in "en-US" for at least 8 seconds:
      """
      UsefulTool Text Editor is a lightweight local workspace. It counts the current document while the browser automatically saves this draft, so a normal reload does not discard the text.
      """
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
      Regex find and replace reports the exact number of matches. Line numbers can be hidden with the small number button without changing the saved document.
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
    Then I finish the recorded demo
