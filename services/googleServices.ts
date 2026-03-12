
import { ReceiptData } from '../types';

const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID;
const SHEETS_FOLDER_ID = import.meta.env.VITE_SHEETS_FOLDER_ID;
const TEMPLATE_SHEET_ID = import.meta.env.VITE_TEMPLATE_SHEET_ID;

// Helper to get access token from gapi client
const getToken = () => {
    return window.gapi.client.getToken().access_token;
};

// Robust date parser
const parseDate = (dateStr: string): Date => {
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    const jpDateMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpDateMatch) {
        return new Date(Number(jpDateMatch[1]), Number(jpDateMatch[2]) - 1, Number(jpDateMatch[3]));
    }

    const slashDateMatch = dateStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (slashDateMatch) {
        return new Date(Number(slashDateMatch[1]), Number(slashDateMatch[2]) - 1, Number(slashDateMatch[3]));
    }

    console.warn(`Could not parse date: ${dateStr}, defaulting to today`);
    return new Date();
};

// 会計年度（4月始まり）の開始年を計算
const getFiscalYear = (date: Date): number => {
    const month = date.getMonth() + 1;
    return month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
};

// 月番号から日本語タブ名を取得（例: 2 → "2月"）
const getMonthTabName = (month: number): string => {
    return `${month}月`;
};

export const uploadImageToDrive = async (base64Image: string, contentType: string, fileName: string): Promise<string> => {
    if (!DRIVE_FOLDER_ID) throw new Error("VITE_DRIVE_FOLDER_ID is not defined");

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
        name: fileName,
        mimeType: contentType,
        parents: [DRIVE_FOLDER_ID]
    };

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        base64Image +
        close_delim;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Content-Type': 'multipart/related; boundary="' + boundary + '"',
            'Authorization': 'Bearer ' + getToken()
        },
        body: multipartRequestBody
    });

    if (!response.ok) {
        throw new Error('Failed to upload image to Drive ' + response.statusText);
    }

    const result = await response.json();

    const fileResponse = await window.gapi.client.drive.files.get({
        fileId: result.id,
        fields: 'webViewLink, webContentLink'
    });

    return fileResponse.result.webViewLink;
};

export const saveToSpreadsheet = async (receipt: ReceiptData, imageUrl: string): Promise<void> => {
    if (!SHEETS_FOLDER_ID) throw new Error("VITE_SHEETS_FOLDER_ID is not defined");
    if (!TEMPLATE_SHEET_ID) throw new Error("VITE_TEMPLATE_SHEET_ID is not defined");

    const dateObj = parseDate(receipt.date);
    const today = new Date(); // 入力日（保存ボタンを押した日）
    const month = today.getMonth() + 1; // 入力日の月を使用
    const fiscalYear = getFiscalYear(today); // 入力日の会計年度を使用
    const fiscalYearLabel = `${fiscalYear}年度_経費精算`;
    const tabName = getMonthTabName(month);

    // 1. 会計年度ファイルをフォルダ内で検索
    const query = `name = '${fiscalYearLabel}' and '${SHEETS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const searchResponse = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    let spreadsheetId = '';

    if (searchResponse.result.files && searchResponse.result.files.length > 0) {
        // 既存の会計年度ファイルを使用
        spreadsheetId = searchResponse.result.files[0].id;
    } else {
        // 2. テンプレートをコピーして新しい会計年度ファイルを作成
        console.log(`テンプレートのコピーを試行中... ID: ${TEMPLATE_SHEET_ID}`);
        try {
            const copyResponse = await window.gapi.client.drive.files.copy({
                fileId: TEMPLATE_SHEET_ID,
                resource: {
                    name: fiscalYearLabel,
                    parents: [SHEETS_FOLDER_ID]
                }
            });
            spreadsheetId = copyResponse.result.id;
            console.log(`新しい会計年度ファイルを作成しました: ${fiscalYearLabel} (ID: ${spreadsheetId})`);
        } catch (err: any) {
            console.error("テンプレートのコピーに失敗しました。IDが正しいか、権限があるか確認してください。", err);
            throw err;
        }
    }

    // 3. 対象月のタブ（例: "4月"）にデータを追記

    // 入力日（今日の日付）を「日のみ」で生成
    const entryDate = today.getDate();
    // 曜日を取得（例: "月", "火"）
    const dayOfWeek = today.toLocaleDateString('ja-JP', { weekday: 'short' });

    // 領収書の日付を (M/D) 形式で生成（日付が読み取れない場合は空欄）
    const receiptDateSuffix = (receipt.date && receipt.date.trim())
        ? `（${dateObj.getMonth() + 1}/${dateObj.getDate()}）`
        : '';

    // サマリー系アイテム（小計・消費税・合計など）を除外し、実際の購入品・使用用途のみ抽出
    const SUMMARY_KEYWORDS = ['小計', '合計', '消費税', '税込', '税抜', '値引', '割引', 'ポイント', '釣り銭', 'お釣り'];
    const productItems = receipt.items?.filter(
        item => !SUMMARY_KEYWORDS.some(kw => item.name.includes(kw))
    ) || [];
    const itemNames = productItems.length > 0
        ? productItems.map(item => item.name).join('、')
        : (receipt.category || receipt.vendorName);
    const purchasedItems = `${itemNames}${receiptDateSuffix}`;

    // C列=曜日, D列=入力日, E列=インボイス, F列=相手先(店舗名), G列=購入物+日付, H列=カテゴリー, I列=空, J列=8%対象合計, K列=10%対象合計
    const invoiceValue = receipt.invoice === true ? '' : '✓';
    const values = [
        [
            dayOfWeek,
            entryDate,
            invoiceValue,
            receipt.vendorName,
            purchasedItems,
            receipt.category || '',
            '',
            receipt.total8Amount || 0,
            receipt.total10Amount || 0
        ]
    ];

    // D列（D7以降）の既存データを取得して次の空き行を計算する
    // appendは「シート全体の最終行」を基準にするため使わず、自分で行番号を特定する
    const START_ROW = 7;
    const existingResponse = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${tabName}!D${START_ROW}:D`
    });
    const existingValues = existingResponse.result.values;
    // 既存データが何行あるか数えて、次の行番号を決定
    const nextRow = START_ROW + (existingValues ? existingValues.length : 0);

    // appendではなくupdateで特定の行に書き込む
    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `${tabName}!C${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: values
        }
    });

    console.log(`${fiscalYearLabel} の「${tabName}」タブの D${nextRow} 行目にデータを書き込みました。`);
};

