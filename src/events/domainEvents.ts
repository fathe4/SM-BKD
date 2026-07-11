// src/events/domainEvents.ts
import { EventEmitter } from "events";

export class DomainEventEmitter extends EventEmitter {}

export const domainEvents = new DomainEventEmitter();
