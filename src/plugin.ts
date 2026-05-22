import streamDeck from "@elgato/streamdeck";

import { SessionSlot } from "./actions/session";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new SessionSlot());

streamDeck.connect();
