import ColumnCombination from '../ColumnCombination';
import FunctionalDependency from '../FunctionalDependency';
import Table from '../Table';

export default class FdScore {
  private table: Table;
  private fd: FunctionalDependency;

  public constructor(table: Table, fd: FunctionalDependency) {
    this.table = table;
    this.fd = fd;
  }

  public get(): number {
    if (!this.fd._score) {
      this.fd._score = this.calculate();
    }
    return this.fd._score;
  }

  public calculate(): number {
    //TODO: change score for fds with NULL values to zero
    return (
      (this.fdLengthScore() +
        this.keyValueScore() +
        this.fdPositionScore() +
        this.fdDensityScore()) /
      4
    );
  }

  private lhsLengthScore(): number {
    return this.fd.lhs.cardinality > 0 ? 1 / this.fd.lhs.cardinality : 0;
  }

  private rhsLengthScore(): number {
    //TODO: Find out the reason for the magic number 2
    return this.table.numColumns > 2
      ? this.fd.rhs.copy().setMinus(this.fd.lhs).cardinality /
          (this.table.numColumns - 2)
      : 0;
  }

  private fdLengthScore(): number {
    return (this.lhsLengthScore() + this.rhsLengthScore()) / 2;
  }

  /**
   * 1 for keys where all key columns have values of length at most 1, less if values can be longer
   * @returns score between 0 and 1
   */
  private keyValueScore(): number {
    //TODO
    return 0;
  }

  public fdPositionScore(): number {
    // TODO fix coherenceScore
    return 0; // (this.lhsPositionScore() + this.rhsPositionScore()) / 2;
  }

  private lhsPositionScore(): number {
    return this.coherenceScore(this.fd.lhs);
  }

  private rhsPositionScore(): number {
    return this.coherenceScore(this.fd.rhs);
  }

  private coherenceScore(attributes: ColumnCombination): number {
    return 1 / (this.numAttributesBetween(attributes) + 1);
  }

  public numAttributesBetween(attributes: ColumnCombination): number {
    let firstColumn = attributes.asArray()[0];
    let lastColumn = attributes.asArray()[attributes.cardinality - 1];
    let range = lastColumn.ordinalPosition - firstColumn.ordinalPosition + 1;
    return range - attributes.cardinality;
  }

  public fdDensityScore(): number {
    //TODO
    return 0;
  }
}
