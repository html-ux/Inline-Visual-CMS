# Inline Visual CMS

GitHub Pages 向けの **ブラウザ完結型ビジュアルCMS** です。  
Pages CMS のように、任意のリポジトリの HTML をその場で編集・保存できます。

## 特徴

- GitHub Personal Access Token をログイン時に入力（**localStorage に保存**）
- リポジトリ内の HTML を一覧 → クリックで編集
- 直接編集（contenteditable） / `data-lock="true"` は編集不可
- 見た目調整（色・余白・角丸・枠線・フォント）
- **ページ全体背景**（単色・グラデ・画像URL・カスタムCSS）
- ブロック挿入 / 複製 / 削除
- Ctrl+Z / Ctrl+Y
- 保存時は GitHub Contents API（SHA取得 → PUT）
- 任意のバックアップ用リポジトリへスナップショット保存

## 必要なもの

1. GitHub リポジトリ（HTML サイト）
2. Fine-grained PAT または classic PAT  
   - 権限: `Contents: Read and write`  
   - 対象リポジトリを選択

## 使い方

1. このリポジトリを GitHub Pages で公開（またはローカルで開く）
2. `admin.html` を開く
3. Owner / Repo / Token を入力して接続
4. ページを選んで編集 → コミットメッセージ付きで保存

## セキュリティ注意

- Token は **あなたのブラウザの localStorage にのみ**保存されます
- このリポジトリ側に Token は送信・保存されません
- 共有PCでは「接続解除」を押して Token を消してください
- `data-lock="true"` を付けた要素は編集できません

## ディレクトリ

```
admin.html          … CMS本体
index.html          … 紹介ページ
assets/css/cms.css  … スタイル
assets/js/cms.js    … ロジック
```

## License

MIT
