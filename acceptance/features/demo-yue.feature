@demo @cantonese @web
Feature: UsefulTool 文字編輯器粵語主要功能示範

  Scenario: 取代文字、保留草稿及傳送去檔案比較
    Given I begin a recorded demo
    And I open the web application at path "/word-count.html"
    When I narrate in "yue-HK" for at least 8 seconds:
      """
      UsefulTool 文字編輯器係一個輕量本機工作區。佢會即時計算文件內容，瀏覽器亦會自動儲存目前草稿，所以一般重新載入唔會清走文字。
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
    When I narrate in "yue-HK" for at least 7 seconds:
      """
      正規表示式尋找同取代會顯示實際命中數量。細小嘅井號按鈕可以隱藏行號，但唔會改動已儲存嘅文件。
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
    When I narrate in "yue-HK" for at least 8 seconds:
      """
      傳送去比較工具之後，編輯文字會自動放喺左邊。已修改字詞預設用唔同深淺嘅紅色同綠色標示，亦可以關閉呢個選項。
      """
    Then I finish the recorded demo
