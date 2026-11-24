import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api.js';

export function useCollection(name) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const records = await api.list(name);
      setData(records);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (payload) => {
    const record = await api.create(name, payload);
    await refresh();
    return record;
  };

  const update = async (id, payload) => {
    const record = await api.patch(name, id, payload);
    await refresh();
    return record;
  };

  const remove = async (id) => {
    await api.remove(name, id);
    await refresh();
  };

  return { data, loading, error, refresh, add, update, remove };
}

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const value = await api.getSettings();
    setSettings(value);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async (payload) => {
    const value = await api.saveSettings(payload);
    setSettings(value);
    return value;
  };

  return { settings, loading, save };
}
