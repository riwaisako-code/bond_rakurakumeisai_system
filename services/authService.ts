
declare global {
    interface Window {
        google: any;
        gapi: any;
    }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY; // Using the same key if it supports Drive/Sheets, otherwise might need separate one. Usually OAuth token is enough for access, API key is for quota.
// Scopes for Drive and Sheets
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleServices = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const checkLibs = setInterval(() => {
            if (window.google && window.gapi) {
                clearInterval(checkLibs);
                initializeGapiClient().then(() => {
                    initializeGisClient();
                    resolve();
                }).catch(reject);
            }
        }, 100);
    });
};

const initializeGapiClient = async () => {
    await new Promise<void>((resolve, reject) => {
        window.gapi.load('client', { callback: resolve, onerror: reject });
    });

    await window.gapi.client.init({
        // apiKey: API_KEY, // Optional if using OAuth, but good for quota usage attribution
        discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            'https://sheets.googleapis.com/$discovery/rest?version=v4'
        ],
    });
    gapiInited = true;
};

const initializeGisClient = () => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined at request time
    });
    gisInited = true;
};

export const handleLogin = async (): Promise<void> => {
    if (!gisInited || !gapiInited) await initGoogleServices();

    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp: any) => {
            if (resp.error !== undefined) {
                reject(resp);
            }
            resolve();
        };

        // Check if we have a valid token
        if (window.gapi.client.getToken() === null) {
            // Prompt the user to select a Google Account and ask for consent to share their data
            // when establishing a new session.
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // Skip display of account chooser and consent dialog for an existing session.
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

export const isAuthenticated = (): boolean => {
    return window.gapi?.client?.getToken() !== null;
};

export const getAccessToken = (): string | null => {
    return window.gapi?.client?.getToken()?.access_token || null;
};
