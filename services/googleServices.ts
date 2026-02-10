
import { ReceiptData } from '../types';

const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID;
const SHEETS_FOLDER_ID = import.meta.env.VITE_SHEETS_FOLDER_ID;

// Helper to get access token from gapi client
const getToken = () => {
    return window.gapi.client.getToken().access_token;
};

// Robust date parser
const parseDate = (dateStr: string): Date => {
    // Try standard constructor
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Try Japanese format YYYY年MM月DD日
    const jpDateMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpDateMatch) {
        return new Date(Number(jpDateMatch[1]), Number(jpDateMatch[2]) - 1, Number(jpDateMatch[3]));
    }

    // Try YYYY/MM/DD
    const slashDateMatch = dateStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (slashDateMatch) {
        return new Date(Number(slashDateMatch[1]), Number(slashDateMatch[2]) - 1, Number(slashDateMatch[3]));
    }

    console.warn(`Could not parse date: ${dateStr}, defaulting to today`);
    return new Date();
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

    // Actually, let's fetch the file fields to get the webViewLink
    const fileResponse = await window.gapi.client.drive.files.get({
        fileId: result.id,
        fields: 'webViewLink, webContentLink'
    });

    return fileResponse.result.webViewLink;
};

export const saveToSpreadsheet = async (receipt: ReceiptData, imageUrl: string): Promise<void> => {
    if (!SHEETS_FOLDER_ID) throw new Error("VITE_SHEETS_FOLDER_ID is not defined");

    const dateObj = parseDate(receipt.date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const sheetName = `${year}-${String(month).padStart(2, '0')}_経費精算`;

    // 1. Search for existing spreadsheet in the folder
    const query = `name = '${sheetName}' and '${SHEETS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const searchResponse = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    let spreadsheetId = '';

    if (searchResponse.result.files && searchResponse.result.files.length > 0) {
        spreadsheetId = searchResponse.result.files[0].id;
    } else {
        // 2. Create new spreadsheet if not found
        const createResponse = await window.gapi.client.sheets.spreadsheets.create({
            resource: {
                properties: {
                    title: sheetName
                }
            }
        });
        spreadsheetId = createResponse.result.spreadsheetId;

        // Move the file to the correct folder (API creates in root by default)
        // Actually, create method doesn't support 'parents' directly in v4 easily without Drive API move.
        // Easier way: Create, then move.

        // Get the file ID of the new spreadsheet (it's the same as spreadsheetId usually, but let's be safe)
        // Actually createResponse returns spreadsheetId which IS the fileId.

        // Move file: Add parent, remove old parents
        const fileId = spreadsheetId;
        const getFileResponse = await window.gapi.client.drive.files.get({
            fileId: fileId,
            fields: 'parents'
        });
        const previousParents = getFileResponse.result.parents.join(',');

        await window.gapi.client.drive.files.update({
            fileId: fileId,
            addParents: SHEETS_FOLDER_ID,
            removeParents: previousParents,
            fields: 'id, parents'
        });

        // Add Header Row
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: 'A1:F1',
            valueInputOption: 'RAW',
            resource: {
                values: [['日付', '店舗名', '費目', '合計金額', '通貨', '画像リンク']]
            }
        });
    }

    // 3. Append Row
    const values = [
        [
            receipt.date,
            receipt.vendorName,
            receipt.category,
            receipt.totalAmount,
            receipt.currency,
            imageUrl
        ]
    ];

    await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: 'A1', // Appends to the first table found
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: values
        }
    });
};
