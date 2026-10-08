import { getPlaygamaStorageItem, setPlaygamaStorageItem, removePlaygamaStorageItem } from './playgamaStorage.js';

export default class gameStorage {

  static isCrazyGames() {
    return window.inCrazyGames;
  }

  static setItem(key, value) {
    // console.log('setItem', key, value );
    try {
      if(process.env.NEXT_PUBLIC_6X === 'true') {
        setPlaygamaStorageItem(key, value);
      } else if(gameStorage.isCrazyGames()) {
        window.CrazyGames.SDK.data.setItem(key, value);
      } else {
      window.localStorage.setItem(key, value);
      }
    } catch (e) {}
  }
  static getItem(key) {
    // console.log('getItem', key );
    try {
      if(process.env.NEXT_PUBLIC_6X === 'true') {
        return getPlaygamaStorageItem(key);
      } else if(gameStorage.isCrazyGames()) {
        return window.CrazyGames.SDK.data.getItem(key);
      } else {
      return window.localStorage.getItem(key);
      }
    } catch (e) {}
  }
  static removeItem(key) {
    // console.log('removeItem', key );
    try {
      if(process.env.NEXT_PUBLIC_6X === 'true') {
        removePlaygamaStorageItem(key);
      } else if(gameStorage.isCrazyGames()) {
        window.CrazyGames.SDK.data.removeItem(key);
      } else {
      window.localStorage.removeItem(key);
      }
    } catch (e) {}
  }
}
