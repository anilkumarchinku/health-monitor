self.addEventListener("push", (event) => {
  const data = event.data
    ? event.data.json()
    : {
        title: "Dee Meal Monitor System",
        body: "Time for a gentle check-in.",
        url: "/",
      };

  event.waitUntil(
    self.registration.showNotification(data.title || "Dee Meal Monitor System", {
      body: data.body || "Time for a gentle check-in.",
      icon: data.icon || "/icon-192.png",
      badge: data.badge || "/badge-72.png",
      tag: data.tag || "daily-health-reminder",
      vibrate: [180, 90, 180],
      silent: false,
      data: {
        url: data.url || "/",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin);
  targetUrl.searchParams.set("reminderSound", "1");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existingClient) {
        return existingClient.navigate(targetUrl.href).then((client) => client?.focus());
      }

      return self.clients.openWindow(targetUrl.href);
    }),
  );
});
