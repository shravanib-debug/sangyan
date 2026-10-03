/* Imported by the generated service worker. Shows a generic notification only;
   the protected explanation loads after the user opens the app and is signed in. */
self.addEventListener("push", (event) => {
  let payload = { title: "Thehrav", body: "Open Thehrav.", url: "/home", tag: "thehrav" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* fall back to the generic text */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon.svg",
      data: { url: payload.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/home", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
