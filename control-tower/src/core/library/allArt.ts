/**
 * Every library picture, registered synchronously. Server-side only (the
 * push pipeline renders synchronously and must pick variants from the block
 * size); the browser loads pictures on demand instead.
 */
import { registerLibraryArt } from "./registry";
import * as coffeeArt from "./art/coffee";
import * as plantArt from "./art/plant";
import * as doorArt from "./art/door";
import * as goodnightArt from "./art/goodnight";
import * as groceriesArt from "./art/groceries";
import * as sunriseArt from "./art/sunrise";
import * as mountainsArt from "./art/mountains";
import * as waveArt from "./art/wave";
import * as umbrellaArt from "./art/umbrella";
import * as snowflakeArt from "./art/snowflake";
import * as heartArt from "./art/heart";
import * as balloonArt from "./art/balloon";
import * as thumbsupArt from "./art/thumbsup";
import * as dndArt from "./art/dnd";
import * as rocketArt from "./art/rocket";
import * as christmasArt from "./art/christmas";
import * as pumpkinArt from "./art/pumpkin";
import * as mapleArt from "./art/maple";
import * as fireworksArt from "./art/fireworks";
import * as vacationArt from "./art/vacation";
import * as mascotArt from "./art/mascot";
import * as robotArt from "./art/robot";
import * as catArt from "./art/cat";
import * as controllerArt from "./art/controller";
import * as astronautArt from "./art/astronaut";
registerLibraryArt("coffee", coffeeArt);
registerLibraryArt("plant", plantArt);
registerLibraryArt("door", doorArt);
registerLibraryArt("goodnight", goodnightArt);
registerLibraryArt("groceries", groceriesArt);
registerLibraryArt("sunrise", sunriseArt);
registerLibraryArt("mountains", mountainsArt);
registerLibraryArt("wave", waveArt);
registerLibraryArt("umbrella", umbrellaArt);
registerLibraryArt("snowflake", snowflakeArt);
registerLibraryArt("heart", heartArt);
registerLibraryArt("balloon", balloonArt);
registerLibraryArt("thumbsup", thumbsupArt);
registerLibraryArt("dnd", dndArt);
registerLibraryArt("rocket", rocketArt);
registerLibraryArt("christmas", christmasArt);
registerLibraryArt("pumpkin", pumpkinArt);
registerLibraryArt("maple", mapleArt);
registerLibraryArt("fireworks", fireworksArt);
registerLibraryArt("vacation", vacationArt);
registerLibraryArt("mascot", mascotArt);
registerLibraryArt("robot", robotArt);
registerLibraryArt("cat", catArt);
registerLibraryArt("controller", controllerArt);
registerLibraryArt("astronaut", astronautArt);
