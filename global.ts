import { DEFAULT_LOCALE } from "@/i18n/config";
import messages from "@/messages/uk.json";

declare module "next-intl" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- next-intl augments this interface through declaration merging.
  interface AppConfig {
    Locale: typeof DEFAULT_LOCALE;
    Messages: typeof messages;
  }
}
