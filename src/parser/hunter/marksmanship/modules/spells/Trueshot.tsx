import React from 'react';
import Analyzer, { SELECTED_PLAYER } from 'parser/core/Analyzer';
import { When, ThresholdStyle } from 'parser/core/ParseResults';
import SPELLS from 'common/SPELLS/hunter';
import SpellIcon from 'common/SpellIcon';
import { formatNumber } from 'common/format';
import STATISTIC_ORDER from 'interface/others/STATISTIC_ORDER';
import RESOURCE_TYPES from 'game/RESOURCE_TYPES';
import ResourceIcon from 'common/ResourceIcon';
import SpellLink from 'common/SpellLink';
import Statistic from 'interface/statistics/Statistic';
import BoringSpellValueText from 'interface/statistics/components/BoringSpellValueText';
import Events, { CastEvent } from 'parser/core/Events';

/**
 * Reduces the cooldown of your Aimed Shot and Rapid Fire by 60%, and causes Aimed Shot to cast 50% faster for 15 sec.
 * Lasts 15 sec.
 *
 * Example log:
 * https://www.warcraftlogs.com/reports/9Ljy6fh1TtCDHXVB#fight=2&type=auras&source=25&ability=288613
 */
class Trueshot extends Analyzer {

  trueshotCasts = 0;
  accumulatedFocusAtTSCast = 0;
  aimedShotsPrTS = 0;
  startFocusForCombatant = 0;

  constructor(options: any) {
    super(options);
    this.addEventListener(Events.cast.by(SELECTED_PLAYER).spell(SPELLS.TRUESHOT), this.onTrueshotCast);
    this.addEventListener(Events.cast.by(SELECTED_PLAYER).spell(SPELLS.AIMED_SHOT), this.onAimedShotCast);
  }

  get averageAimedShots() {
    const averageAimedShots = (this.aimedShotsPrTS / this.trueshotCasts);
    return isNaN(averageAimedShots) ? 0 : averageAimedShots;
  }

  get averageFocus() {
    return formatNumber(this.accumulatedFocusAtTSCast / this.trueshotCasts);
  }

  get aimedShotThreshold() {
    return {
      actual: this.averageAimedShots,
      isLessThan: {
        minor: 3,
        average: 2.5,
        major: 2,
      },
      style: ThresholdStyle.DECIMAL,
    };
  }

  onTrueshotCast(event: CastEvent) {
    this.trueshotCasts += 1;
    const resource = event.classResources?.find(resource => resource.type === RESOURCE_TYPES.FOCUS.id);
    if (!resource) {
      return;
    }
    this.accumulatedFocusAtTSCast += resource.amount || 0;
  }

  onAimedShotCast() {
    if (this.selectedCombatant.hasBuff(SPELLS.TRUESHOT.id)) {
      this.aimedShotsPrTS += 1;
    }
  }

  statistic() {
    return (
      <Statistic
        position={STATISTIC_ORDER.OPTIONAL(1)}
        size="flexible"
        tooltip={(
          <>
            Information regarding your average Trueshot window:
            <ul>
              <li>You started your Trueshot windows with an average of {this.averageFocus} Focus.</li>
              <li>You hit an average of {this.averageAimedShots.toFixed(1)} Aimed Shots inside each Trueshot window.</li>
            </ul>
          </>
        )}
      >
        <BoringSpellValueText spell={SPELLS.TRUESHOT}>
          <>
            {this.averageAimedShots.toFixed(1)}{' '}
            <SpellIcon
              id={SPELLS.AIMED_SHOT.id}
              style={{
                height: '1.3em',
                marginTop: '-.1em',
              }}
            />
            {' '}{this.averageFocus}{' '}
            <ResourceIcon
              id={RESOURCE_TYPES.FOCUS.id}
              style={{
                height: '1.3em',
                marginTop: '-.1em',
              }}
              noLink={false}
            />
          </>
        </BoringSpellValueText>
      </Statistic>
    );
  }

  suggestions(when: When) {
    when(this.aimedShotThreshold).addSuggestion((suggest, actual, recommended) => {
      return suggest(<>You only cast {actual.toFixed(1)} <SpellLink id={SPELLS.AIMED_SHOT.id} />s inside your average <SpellLink id={SPELLS.TRUESHOT.id} /> window. This is your only DPS cooldown, and it's important to maximize it to it's fullest potential by getting as many Aimed Shot squeezed in as possible.</>)
        .icon(SPELLS.TRUESHOT.icon)
        .actual(`Average of ${actual.toFixed(1)} Aimed Shots per Trueshot.`)
        .recommended(`>${recommended} is recommended`);
    });
  }
}

export default Trueshot;