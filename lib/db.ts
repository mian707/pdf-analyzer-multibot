/**
 * IndexedDB helper for persisting PDF Blobs.
 */

const DB_NAME = 'BioReviewProDB_v3';
const STORE_PDFS = 'pdf_blobs';
const STORE_STATE = 'project_state';
const DB_VERSION = 1;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS);
      }
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getScopedKey = (projectId: string, recordId: number | string) => `${projectId}_${recordId}`;

export const saveBlob = async (projectId: string, recordId: number | string, blob: Blob): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_PDFS, 'readwrite');
    const store = transaction.objectStore(STORE_PDFS);
    const request = store.put(blob, getScopedKey(projectId, recordId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getBlob = async (projectId: string, recordId: number | string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_PDFS, 'readonly');
    const store = transaction.objectStore(STORE_PDFS);
    const request = store.get(getScopedKey(projectId, recordId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const saveProjectState = async (projectId: string, state: any): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_STATE, 'readwrite');
    const store = transaction.objectStore(STORE_STATE);
    const request = store.put(state, projectId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getProjectState = async (projectId: string): Promise<any | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_STATE, 'readonly');
    const store = transaction.objectStore(STORE_STATE);
    const request = store.get(projectId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const deleteProjectBlobs = async (projectId: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PDFS, STORE_STATE], 'readwrite');
    
    // Delete state
    transaction.objectStore(STORE_STATE).delete(projectId);
    
    // Delete blobs
    const pdfStore = transaction.objectStore(STORE_PDFS);
    const request = pdfStore.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (cursor.key.toString().startsWith(`${projectId}_`)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const clearAllBlobs = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PDFS, STORE_STATE], 'readwrite');
    transaction.objectStore(STORE_PDFS).clear();
    transaction.objectStore(STORE_STATE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};