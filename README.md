# company-os

這個 repo 目前是**空的**，由 2026-11-03 起重新開始。

程式碼與文件已清空，因為之前的產出沒有解決真正要解決的問題，決定由零開始。

---

## 現在這裡有什麼

只有這份 README。

---

## 接下來會放什麼

由計劃決定。在計劃定案之前，不要在這裡加任何東西。

---

## 舊內容去哪裡了

沒有消失，只是不在檔案樹裡：

```bash
# 看全部歷史
git log --all --oneline

# 找回任何一個舊檔案
git show <commit>:<路徑>

# 或整棵樹取回到另一個資料夾
git archive <commit> | tar -x -C /tmp/old-company-os
```

**回復整個舊狀態**：

```bash
git revert --no-commit <清空的 commit>
git commit -m "回復清空前的內容"
```
