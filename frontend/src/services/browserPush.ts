import { reminderAPI } from "./api/reminderApi";

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/service-worker.js");
}

export async function enableBrowserPush(): Promise<void> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key) throw new Error("Browser notifications are not configured");
  const registration = await registerServiceWorker();
  if (!registration || !("PushManager" in window)) throw new Error("Browser push is not supported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Browser notification permission was not granted");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(key).buffer as ArrayBuffer,
  });
  await reminderAPI.savePushSubscription(subscription.toJSON());
}
