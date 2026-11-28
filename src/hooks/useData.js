import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { normaliseRecords } from '../lib/normalise.js';

export function useCollection(name) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const records = await api.list(name);
      setData(Array.isArray(records) ? records : normaliseRecords(records));
      setError(null);
    } catch (err) {
      setData([]);
      setError(err.message || 'Could not load records.');
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (payload) => {
    const record = await api.create(name, payload);
    setError(null);
    await refresh();
    return record;
  };

  const update = async (id, payload) => {
    const record = await api.patch(name, id, payload);
    setError(null);
    await refresh();
    return record;
  };

  const remove = async (id) => {
    try {
      await api.remove(name, id);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not delete record.');
      throw err;
    }
  };

  return { data, loading, error, refresh, add, update, remove };
}

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api.getSettings();
      setSettings(value);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load technology settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async (payload) => {
    try {
      const value = await api.saveSettings(payload);
      setSettings(value);
      setError(null);
      return value;
    } catch (err) {
      setError(err.message || 'Could not save technology settings.');
      throw err;
    }
  };

  return { settings, loading, error, save };
}
