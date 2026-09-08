import { createConsumer } from "@rails/actioncable";

let consumer = null;

export function getCableConsumer() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!consumer) {
    consumer = createConsumer();
  }

  return consumer;
}

export default getCableConsumer;