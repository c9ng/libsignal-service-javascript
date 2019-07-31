"use strict";
const helpers = require("../src/helpers.js");

class Storage {
  constructor() {
    this._init();
  }

  _init() {
    this._store = {
      identityKey: {},
      session: {},
      "25519KeypreKey": {},
      "25519KeysignedKey": {},
      unprocessed: {},
      configuration: {}
    };
  }

  _put(namespace, id, data) {
    this._store[namespace][id] = helpers.jsonThing(data);
  }

  _get(namespace, id) {
    const value = this._store[namespace][id];
    return JSON.parse(value);
  }

  _getAll(namespace) {
    const collection = [];
    for (let id of Object.keys(this._store[namespace])) {
      collection.push(this._get("", id));
    }
    return collection;
  }

  _remove(namespace, id) {
    delete this._store[namespace][id];
  }

  _removeAll(namespace) {
    this._store[namespace] = {};
  }

  async getAllIdentityKeys() {
    return this._getAll("identityKey");
  }

  async createOrUpdateIdentityKey(data) {
    const { id } = data;
    this._put("identityKey", id, data);
  }

  async removeIdentityKeyById(id) {
    this._remove("identityKey", id);
  }

  async getAllSessions() {
    return this._getAll("session");
  }

  async createOrUpdateSession(data) {
    const { id } = data;
    this._put("session", id, data);
  }

  async removeSessionById(id) {
    this._remove("session", id);
  }

  async removeSessionsByNumber(number) {
    for (let id of Object.keys(this._store["session"])) {
      const session = this._get("session", id);
      if (session.number === number) {
        this._remove("session", id);
      }
    }
  }

  async removeAllSessions() {
    this._removeAll("session");
  }

  async getAllPreKeys() {
    return this._getAll("25519KeypreKey");
  }

  async createOrUpdatePreKey(data) {
    const { id } = data;
    this._put("25519KeypreKey", id, data);
  }
  async removePreKeyById(id) {
    this._remove("25519KeypreKey", id);
  }
  async removeAllPreKeys() {
    return this._removeAll("25519KeypreKey");
  }

  async getAllSignedPreKeys() {
    return this._getAll("25519KeysignedKey");
  }

  async createOrUpdateSignedPreKey(data) {
    const { id } = data;
    this._put("25519KeysignedKey", id, data);
  }

  async removeSignedPreKeyById(id) {
    this._remove("25519KeysignedKey", id);
  }
  async removeAllSignedPreKeys() {
    this._removeAll("25519KeysignedKey");
  }

  async getAllUnprocessed() {
    return this._getAll("unprocessed");
  }

  getUnprocessedCount() {
    return Object.keys(this.store["unprocessed"]).length;
  }

  getUnprocessedById(id) {
    this._get("unprocessed", id);
  }

  saveUnprocessed(data) {
    const { id } = data;
    this._put("unprocessed", id, data);
  }

  updateUnprocessedAttempts(id, attempts) {
    const data = this._get("unprocessed", id);
    data.attempts = attempts;
    this._put("unprocessed", id, data);
  }

  updateUnprocessedWithData(id, data) {
    this._put("unprocessed", id, data);
  }

  removeUnprocessed(id) {
    this._remove("unprocessed", id);
  }

  removeAllUnprocessed() {
    this._removeAll("unprocessed");
  }

  async getAllConfiguration() {
    return this._getAll("configuration");
  }

  async createOrUpdateConfiguration(data) {
    const { id } = data;
    this._put("configuration", id, data);
  }

  async removeConfigurationById(id) {
    this._remove("configuration", id);
  }

  async removeAllConfiguration() {
    this._removeAll("configuration");
  }

  async removeAll() {
    this._init();
  }
}

exports = module.exports = Storage;
