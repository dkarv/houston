// Service worker: shows Houston's push notifications and opens the ring when tapped.
self.addEventListener('push', (event) => {
  let message;
  try {
    message = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      data: message.data,
      tag: message.data && message.data.ringId,
      requireInteraction: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === new URL(url).origin && 'navigate' in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
