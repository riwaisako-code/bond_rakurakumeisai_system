
import { ReceiptData } from '../types';

const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID;
const SHEETS_FOLDER_ID = import.meta.env.VITE_SHEETS_FOLDER_ID;

// Helper to get access token from gapi client
const getToken = () => {
    return window.gapi.client.getToken().access_token;
};

export const uploadImageToDrive = async (base64Image: string, contentType: string, fileName: string): Promise<string> => {
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
        throw new Error('Failed to upload image to Drive');
    }

    const result = await response.json();

    // Get the webViewLink (or we can just construct it)
    // We need to make the file accessible or just use the private link if the user has access.
    // Generally, just returning the ID or alternateLink is enough.
    // Let's get the file fields to be sure.

    // Actually, let's fetch the file fields to get the webViewLink
    const fileResponse = await window.gapi.client.drive.files.get({
        fileId: result.id,
        fields: 'webViewLink, webContentLink'
    });

    return fileResponse.result.webViewLink;
};

export const saveToSpreadsheet = async (receipt: ReceiptData, imageUrl: string): Promise<void> => {
    const dateObj = new Date(receipt.date);
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
