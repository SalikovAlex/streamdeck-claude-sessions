import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { SessionSlot } from "./actions/session";

streamDeck.logger.setLevel(LogLevel.INFO);

streamDeck.actions.registerAction(new SessionSlot());

streamDeck.connect();
