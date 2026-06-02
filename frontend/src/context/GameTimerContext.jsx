import React, { createContext, useContext, useState, useEffect, useRef } from "react";

const DAILY_LIMIT = 25 * 60; // 1500 seconds

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function storageKey(userId) {
  return "sst_" + (userId || "guest") + "_" + todayKey();
}

function loadUsed(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : n;
  } catch { return 0; }
}

function saveUsed(userId, seconds) {
  try { localStorage.setItem(storageKey(userId), String(seconds)); } catch {}
}

const Ctx = createContext(null);

export function GameTimerProvider({ userId, children }) {
  const [used, setUsed] = useState(() => loadUsed(userId));
  const runningRef = useRef(false);
  const intervalRef = useRef(null);

  const remaining = Math.max(0, DAILY_LIMIT - used);
  const isExpired = used >= DAILY_LIMIT;

  function startTracking() {
    if (runningRef.current || isExpired) return;
    runningRef.current = true;
    intervalRef.current = setInterval(() => {
      setUsed(prev => {
        const next = prev + 1;
        saveUsed(userId, next);
        if (next >= DAILY_LIMIT) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          runningRef.current = false;
        }
        return next;
      });
    }, 1000);
  }

  function stopTracking() {
    runningRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => () => stopTracking(), []);

  return (
    <Ctx.Provider value={{ remaining, isExpired, startTracking, stopTracking }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGameTimer() {
  return useContext(Ctx);
}
