export class RoomCreationAttemptsExhaustedError extends Error {
  constructor() {
    super("Could not create a room after the bounded collision retries.");
    this.name = "RoomCreationAttemptsExhaustedError";
  }
}

export class RoomCreationRequestUnavailableError extends Error {
  constructor() {
    super("The room creation request belongs to an unavailable room.");
    this.name = "RoomCreationRequestUnavailableError";
  }
}
