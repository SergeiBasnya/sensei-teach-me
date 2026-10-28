// Sépare les reprises d’écoute des nouvelles questions, et invalide les tâches arrêtées.
export class OralRun {
  private sequence = 0;
  private active = false;
  private permission = false;
  private spoken = "";
  get isActive(): boolean {
    return this.active;
  }
  begin(): number | null {
    if (this.active) return null;
    this.active = true;
    return ++this.sequence;
  }
  current(id: number): boolean {
    return this.active && this.sequence === id;
  }
  stop(): number {
    this.active = false;
    this.permission = false;
    return ++this.sequence;
  }
  stopped(id: number): boolean {
    return !this.active && this.sequence === id;
  }
  requestingPermission(id: number, value: boolean): void {
    if (this.current(id)) this.permission = value;
  }
  shouldPause(state: string): boolean {
    return state !== "active" && !this.permission;
  }
  needsReading(question: string): boolean {
    return question !== this.spoken;
  }
  didRead(id: number, question: string): void {
    if (this.current(id)) this.spoken = question;
  }
}
