self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || "Botony reminder", {
    body: payload.body || "You have a medication reminder.",
    tag: payload.id,
    data: { url: "/chat", notificationId: payload.id },
    renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).pathname === "/chat");
    return existing ? existing.focus() : clients.openWindow("/chat");
  }));
});
