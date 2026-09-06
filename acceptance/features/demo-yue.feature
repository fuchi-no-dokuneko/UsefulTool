@demo @cantonese @web
Feature: UsefulTool 粵語主要功能示範

  Scenario: 瀏覽本機工具、編輯比較文字及建立 PDF
    Given I begin a recorded demo
    And I open the web application at path "/"
    When I narrate in "yue-HK" for at least 8 seconds:
      """
      UsefulTool 集中咗十三個瀏覽器工具。所有工具都會喺本機處理資料，支援深色同淺色模式，亦有獨立 HTML 可以下載離線使用。
      """
    Then exactly 13 elements match CSS ".tools article"
    When I open the web application at path "/calculator.html"
    And I replace CSS "#expression" with "2+3*4"
    Then CSS "#result" has text "14"
    When I narrate in "yue-HK" for at least 7 seconds:
      """
      計算機支援一般算式、科學函數、角度模式、歷史記錄同數值積分；相關單位轉換器就涵蓋十八個分類。
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
    When I narrate in "yue-HK" for at least 7 seconds:
      """
      輕量編輯器會計算文字、管理多個自動儲存草稿、做正規表示式取代同盡量格式化程式碼，亦可以預覽 Markdown，同匯出文字、報告及草稿鎖匙。
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
    When I open the web application at path "/images-to-pdf.html"
    And I upload acceptance fixture "sample.png,sample-alt.png" to CSS "#imageInput"
    Then CSS "#status" eventually contains text "2 image(s) ready."
    When I set CSS checkbox "#caption" to checked
    And I click CSS "#buildButton"
    Then CSS "#status" eventually contains text "Created 2 page(s)"
    And a downloaded file matching "usefultool-images*.pdf" appears
    When I narrate in "yue-HK" for at least 9 seconds:
      """
      圖像工具可以移除背景、檢查私隱 metadata、編輯圖層同建立 PDF。工作區另外仲有 Base64、ROT、文字傳送、PDF 合併同點對點 LAN 聊天。
      """
    Then I finish the recorded demo
