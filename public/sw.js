self.addEventListener("push", (event) => {
  const data = event.data
    ? event.data.json()
    : {
        title: "Daily Health Companion",
        body: "Time for a gentle check-in.",
        url: "/",
      };

  event.waitUntil(
    self.registration.showNotification(data.title || "Daily Health Companion", {
      body: data.body || "Time for a gentle check-in.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || "daily-health-reminder",
      data: {
        url: data.url || "/",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.includes(targetUrl));
      if (existingClient) return existingClient.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
