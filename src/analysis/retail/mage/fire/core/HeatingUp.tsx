import { Trans } from '@lingui/macro';
import {
  FIRESTARTER_THRESHOLD,
  SEARING_TOUCH_THRESHOLD,
  SharedCode,
} from 'analysis/retail/mage/shared';
import { formatPercentage } from 'common/format';
import SPELLS from 'common/SPELLS';
import TALENTS from 'common/TALENTS/mage';
import { SpellLink, SpellIcon } from 'interface';
import { highlightInefficientCast } from 'interface/report/Results/Timeline/Casts';
import Analyzer, { Options, SELECTED_PLAYER } from 'parser/core/Analyzer';
import Events, { CastEvent } from 'parser/core/Events';
import { When, ThresholdStyle } from 'parser/core/ParseResults';
import AbilityTracker from 'parser/shared/modules/AbilityTracker';
import CooldownHistory from 'parser/shared/modules/CooldownHistory';
import BoringSpellValueText from 'parser/ui/BoringSpellValueText';
import Statistic from 'parser/ui/Statistic';
import STATISTIC_ORDER from 'parser/ui/STATISTIC_ORDER';

class HeatingUp extends Analyzer {
  static dependencies = {
    sharedCode: SharedCode,
    cooldownHistory: CooldownHistory,
    abilityTracker: AbilityTracker,
  };
  protected sharedCode!: SharedCode;
  protected cooldownHistory!: CooldownHistory;
  protected abilityTracker!: AbilityTracker;

  hasFirestarter: boolean = this.selectedCombatant.hasTalent(TALENTS.FIRESTARTER_TALENT);
  hasSearingTouch: boolean = this.selectedCombatant.hasTalent(TALENTS.SEARING_TOUCH_TALENT);
  hasFlameOn: boolean = this.selectedCombatant.hasTalent(TALENTS.FLAME_ON_TALENT);

  fireBlasts: { cast: CastEvent; hasHeatingUp: boolean; hasHotStreak: boolean }[] = [];
  phoenixCasts: { cast: CastEvent; hasHotStreak: boolean }[] = [];

  constructor(options: Options) {
    super(options);
    this.addEventListener(
      Events.cast.by(SELECTED_PLAYER).spell(TALENTS.PHOENIX_FLAMES_TALENT),
      this.onPhoenixCast,
    );
    this.addEventListener(
      Events.cast.by(SELECTED_PLAYER).spell(SPELLS.FIRE_BLAST),
      this.onFireBlastCast,
    );
  }

  onFireBlastCast(event: CastEvent) {
    this.fireBlasts.push({
      cast: event,
      hasHeatingUp: this.selectedCombatant.hasBuff(SPELLS.HEATING_UP.id),
      hasHotStreak: this.selectedCombatant.hasBuff(SPELLS.HOT_STREAK.id),
    });
  }

  onPhoenixCast(event: CastEvent) {
    this.phoenixCasts.push({
      cast: event,
      hasHotStreak: this.selectedCombatant.hasBuff(SPELLS.HOT_STREAK.id),
    });
  }

  fireBlastWithoutHeatingUp = () => {
    let casts = this.fireBlasts.filter((c) => !c.hasHeatingUp);

    //If Hot Streak was active, filter it out
    casts = casts.filter((c) => !c.hasHotStreak);

    //If Combustion was active, filter it out
    casts = casts.filter(
      (c) => !this.selectedCombatant.hasBuff(TALENTS.COMBUSTION_TALENT.id, c.cast.timestamp),
    );

    //If Firestarter or Searing Touch was active, filter it out
    casts = casts.filter((c) => {
      const targetHealth = this.sharedCode.getTargetHealth(c.cast);
      if (this.hasFirestarter) {
        return targetHealth && targetHealth < FIRESTARTER_THRESHOLD;
      } else if (this.hasSearingTouch) {
        return targetHealth && targetHealth > SEARING_TOUCH_THRESHOLD;
      } else {
        return true;
      }
    });

    //If the player was capped on charges, filter it out
    casts = casts.filter((c) => {
      const maxCharges = 1 + this.selectedCombatant.getTalentRank(TALENTS.FLAME_ON_TALENT);
      const charges = this.cooldownHistory.chargesAvailable(SPELLS.FIRE_BLAST.id, c.cast.timestamp);
      return charges !== maxCharges;
    });

    //Highlight bad casts
    const tooltip =
      'This Fire Blast was cast without Heating Up, Combustion, Searing Touch, or Firestarter active.';
    casts.forEach((c) => highlightInefficientCast(c.cast, tooltip));

    return casts.length;
  };

  get fireBlastsDuringHotStreak() {
    return this.fireBlasts.filter((c) => c.hasHotStreak).length;
  }

  get phoenixFlamesDuringHotStreak() {
    return this.phoenixCasts.filter((c) => c.hasHotStreak).length;
  }

  get totalFireBlasts() {
    return this.fireBlasts.length;
  }

  get totalWasted() {
    return (
      this.fireBlastWithoutHeatingUp() +
      this.fireBlastsDuringHotStreak +
      this.phoenixFlamesDuringHotStreak
    );
  }

  get fireBlastUtilSuggestionThresholds() {
    return {
      actual:
        1 -
        (this.fireBlastWithoutHeatingUp() + this.fireBlastsDuringHotStreak) / this.totalFireBlasts,
      isLessThan: {
        minor: 0.95,
        average: 0.9,
        major: 0.85,
      },
      style: ThresholdStyle.PERCENTAGE,
    };
  }

  get phoenixFlamesUtilSuggestionThresholds() {
    return {
      actual:
        1 -
        this.phoenixFlamesDuringHotStreak /
          this.abilityTracker.getAbility(TALENTS.PHOENIX_FLAMES_TALENT.id).casts,
      isLessThan: {
        minor: 0.95,
        average: 0.9,
        major: 0.85,
      },
      style: ThresholdStyle.PERCENTAGE,
    };
  }

  suggestions(when: When) {
    when(this.fireBlastUtilSuggestionThresholds).addSuggestion((suggest, actual, recommended) =>
      suggest(
        <>
          You cast <SpellLink spell={SPELLS.FIRE_BLAST} /> {this.fireBlastsDuringHotStreak} times
          while <SpellLink spell={SPELLS.HOT_STREAK} /> was active and{' '}
          {this.fireBlastWithoutHeatingUp()} times while you didnt have{' '}
          <SpellLink spell={SPELLS.HEATING_UP} />. Make sure that you are only using Fire Blast to
          convert Heating Up into Hot Streak or if you are going to cap on charges.
        </>,
      )
        .icon(SPELLS.FIRE_BLAST.icon)
        .actual(
          <Trans id="mage.fire.suggestions.heatingUp.fireBlastUtilization">
            {formatPercentage(this.fireBlastUtilSuggestionThresholds.actual)}% Utilization
          </Trans>,
        )
        .recommended(`<${formatPercentage(recommended)}% is recommended`),
    );
    when(this.phoenixFlamesUtilSuggestionThresholds).addSuggestion((suggest, actual, recommended) =>
      suggest(
        <>
          You cast <SpellLink spell={TALENTS.PHOENIX_FLAMES_TALENT} />{' '}
          {this.phoenixFlamesDuringHotStreak} times while <SpellLink spell={SPELLS.HOT_STREAK} />{' '}
          was active. This is a waste as the <SpellLink spell={TALENTS.PHOENIX_FLAMES_TALENT} />{' '}
          could have contributed towards the next <SpellLink spell={SPELLS.HEATING_UP} /> or{' '}
          <SpellLink spell={SPELLS.HOT_STREAK} />.
        </>,
      )
        .icon(TALENTS.PHOENIX_FLAMES_TALENT.icon)
        .actual(
          <Trans id="mage.fire.suggestions.heatingUp.phoenixFlames.utilization">
            {formatPercentage(this.phoenixFlamesUtilSuggestionThresholds.actual)}% Utilization
          </Trans>,
        )
        .recommended(`<${formatPercentage(recommended)}% is recommended`),
    );
  }

  statistic() {
    return (
      <Statistic
        position={STATISTIC_ORDER.CORE(14)}
        size="flexible"
        tooltip={
          <>
            Outside of Combustion & Firestarter, spells that are guaranteed to crit (like Fire
            Blast) should only be used to convert Heating Up into Hot Streak. While there are minor
            exceptions to this (like if you are about to cap on charges), the goal should be to
            waste as few of these as possible. Additionally, you should never cast Fire Blast or
            Phoenix Flames while Hot Streak is active, as those could have contributed towards your
            next Heating Up/Hot Streak
            <ul>
              <li>Fireblast used without Heating Up: {this.fireBlastWithoutHeatingUp()}</li>
              <li>Fireblast used during Hot Streak: {this.fireBlastsDuringHotStreak}</li>
              <li>Phoenix Flames used during Hot Streak: {this.phoenixFlamesDuringHotStreak}</li>
            </ul>
          </>
        }
      >
        <BoringSpellValueText spell={SPELLS.HEATING_UP}>
          <>
            <SpellIcon spell={SPELLS.FIRE_BLAST} />{' '}
            {formatPercentage(this.fireBlastUtilSuggestionThresholds.actual, 0)}%{' '}
            <small>Fire Blast Utilization</small>
            <br />
            <SpellIcon spell={TALENTS.PHOENIX_FLAMES_TALENT} />{' '}
            {formatPercentage(this.phoenixFlamesUtilSuggestionThresholds.actual, 0)}%{' '}
            <small>Phoenix Flames Utilization</small>
          </>
        </BoringSpellValueText>
      </Statistic>
    );
  }
}

export default HeatingUp;
