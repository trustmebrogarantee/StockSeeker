export class IndexedDBStorage {
    constructor(dbName = 'LocalStorageDB', storeName = 'keyValueStore') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
    }

    // Initialize the database
    async init() {
        if (this.db) return;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Set item, overwriting existing content for the key
    async setItem(key, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Get item by key, returns null if not found
    async getItem(key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = (event) => {
                const result = event.target.result;
                resolve(result ? result.value : null);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }
}

// Usage example:
/*
const storage = new IndexedDBStorage();
await storage.setItem('myKey', 'myValue');
const value = await storage.getItem('myKey');
console.log(value); // 'myValue'
*/