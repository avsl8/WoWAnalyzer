import SPELLS from 'common/SPELLS';
import Analyzer, { Options, SELECTED_PLAYER } from 'parser/core/Analyzer';
import Events, { HealEvent } from 'parser/core/Events';
import { isFromEssenceFont, isFromExpelHarm } from '../../normalizers/CastLinkNormalizer';

class ExpelHarm extends Analyzer {
  selfHealing: number = 0;
  selfOverheal: number = 0;
  targetHealing: number = 0;
  targetOverheal: number = 0;
  gustsHealing: number = 0;

  constructor(options: Options) {
    super(options);
    this.addEventListener(
      Events.heal.by(SELECTED_PLAYER).spell(SPELLS.EXPEL_HARM),
      this.handleExpelHarm,
    );
    this.addEventListener(
      Events.heal.by(SELECTED_PLAYER).spell(SPELLS.EXPEL_HARM_TARGET_HEAL),
      this.handleTargetExpelHarm,
    );
    this.addEventListener(
      Events.heal.by(SELECTED_PLAYER).spell(SPELLS.GUSTS_OF_MISTS),
      this.handleMastery,
    );
  }

  handleExpelHarm(event: HealEvent) {
    this.selfHealing += (event.amount || 0) + (event.absorbed || 0);
    this.selfOverheal += event.overheal || 0;
  }

  handleTargetExpelHarm(event: HealEvent) {
    this.targetHealing += (event.amount || 0) + (event.absorbed || 0);
    this.targetOverheal += event.overheal || 0;
  }

  handleMastery(event: HealEvent) {
    if (isFromExpelHarm(event) && !isFromEssenceFont(event)) {
      this.gustsHealing += (event.amount || 0) + (event.absorbed || 0);
    }
  }
}

export default ExpelHarm;
