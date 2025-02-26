import Column from './Column';
import ColumnCombination from './ColumnCombination';
import FunctionalDependency from './FunctionalDependency';
import ITable from '@server/definitions/ITable';
import Relationship from './Relationship';
import FdScore from './methodObjects/FdScore';
import SourceTable from './SourceTable';
import SourceColumn from './SourceColumn';
import SourceTableInstance from './SourceTableInstance';
import { FdCluster } from '../types/FdCluster';
import BasicTable from './BasicTable';
import ColumnsTree from './ColumnsTree';
import SourceRelationship from './SourceRelationship';
import TableRelationship from './TableRelationship';

export default class Table extends BasicTable {
  public columns: ColumnCombination;
  public pk?: ColumnCombination = undefined;
  public fds: Array<FunctionalDependency> = [];
  public relationships = new Array<Relationship>();
  public sources = new Array<SourceTableInstance>();
  private _violatingFds?: Array<FunctionalDependency>;
  private _keys?: Array<ColumnCombination>;
  private _fdClusters?: Array<FdCluster>;
  public surrogateKey: string = '';
  public implementsSurrogateKey(): boolean {
    return this.surrogateKey.length >= 1;
  }
  /**
   * cached results of schema.indsOf(this). Should not be accessed from outside the schema class
   */
  public _inds!: Map<SourceRelationship, Array<TableRelationship>>;
  /**
   * This variable tracks if the cached inds are still valid
   */
  public _indsValid = false;

  public toJSON() {
    return {
      name: this.name,
      schemaName: this.schemaName,
      columns: this.columns,
      pk: this.pk,
      sk: this.surrogateKey,
      relationships: this.relationships,
      sources: this.sources,
    };
  }

  public constructor(columns?: ColumnCombination) {
    super();
    this.columns = columns || new ColumnCombination();
  }

  public static fromITable(iTable: ITable): Table {
    const sourceTable = new SourceTable(iTable.name, iTable.schemaName);
    const table = new Table();
    const sourceTableInstance = table.addSource(sourceTable);
    iTable.attributes.forEach((iAttribute, index) => {
      const sourceColumn = new SourceColumn(
        iAttribute.name,
        sourceTable,
        iAttribute.dataType,
        index,
        iAttribute.nullable
      );
      table.addColumns(new Column(sourceTableInstance, sourceColumn));
    });
    table.name = sourceTable.name;
    table.schemaName = sourceTable.schemaName;
    return table;
  }

  /**
   * This way of creating Table objects should not be used in production as important information (datatype and nullable) are missing
   */
  public static fromColumnNames(columnNames: Array<string>, tableName: string) {
    const sourceTable = new SourceTable(tableName, '');
    const table = new Table();
    const sourceTableInstance = table.addSource(sourceTable);

    columnNames.forEach((name, i) => {
      const sourceColumn = new SourceColumn(
        name,
        sourceTable,
        'unknown data type',
        i,
        false
      );
      table.addColumns(new Column(sourceTableInstance, sourceColumn));
    });
    table.name = tableName;
    table.schemaName = '';
    return table;
  }

  /**
   * finds a column in the tables columns which is equal to the given column.
   * Returns the column itself if no equal column is found.
   */
  public findEqualSelectedColumn(column: Column): Column {
    return (
      this.columns.asArray().find((other) => other.equals(column)) || column
    );
  }

  public establishIdentities() {
    if (this.pk) {
      this.pk = new ColumnCombination(
        this.pk.asArray().map((column) => this.findEqualSelectedColumn(column))
      );
    }
    this.relationships.forEach((relationship) => {
      relationship.referencing = relationship.referencing.map((column) =>
        this.findEqualSelectedColumn(column)
      );
      relationship.referenced = relationship.referenced.map((column) =>
        this.findEqualSelectedColumn(column)
      );
    });
  }

  public resolveColumnNameDuplicates() {
    const checked = new Set<Column>();
    for (const column of this.columns) {
      if (checked.has(column)) continue;
      const sameName = this.columns
        .asArray()
        .filter((other) => other.baseAlias == column.baseAlias);
      if (sameName.length > 1)
        sameName.forEach(
          (equivColumn) => (equivColumn.includeSourceName = true)
        );
      else column.includeSourceName = false;
      sameName.forEach((column) => checked.add(column));
    }
  }

  public addColumns(...columns: Array<Column>) {
    this.columns.add(...columns);
    this.resolveColumnNameDuplicates();
  }

  public removeColumns(...columns: Array<Column>) {
    this.columns.delete(...columns);
    this.resolveColumnNameDuplicates();
  }

  public resolveSourceNameDuplicates() {
    const checked = new Set<SourceTableInstance>();
    for (const source of this.sources) {
      if (checked.has(source)) continue;
      const sameName = this.sources.filter(
        (other) => other.baseAlias == source.baseAlias
      );
      const useId = sameName.length > 1;
      sameName.forEach((equivSource, i) => {
        equivSource.id = i + 1;
        equivSource.useId = useId;
      });
      sameName.forEach((source) => checked.add(source));
    }
  }

  public addSource(
    sourceTable: SourceTable,
    name?: string
  ): SourceTableInstance {
    const newSource = new SourceTableInstance(sourceTable, name);
    this.sources.push(newSource);
    this.resolveSourceNameDuplicates();
    return newSource;
  }

  public get numColumns(): number {
    return this.columns.cardinality;
  }

  public setFds(fds: Array<FunctionalDependency>) {
    this.fds = fds;
    this.fds = fds.filter((fd) => !fd.isFullyTrivial()); // needed?
  }

  public addFd(fd: FunctionalDependency) {
    this.fds.push(fd);
  }

  public remainingSchema(fd: FunctionalDependency): ColumnCombination {
    return this.columns.copy().setMinus(fd.rhs).union(fd.lhs).copy();
  }

  public generatingSchema(fd: FunctionalDependency): ColumnCombination {
    return fd.rhs.copy();
  }

  public splitPreservesCC(
    fd: FunctionalDependency,
    cc: ColumnCombination
  ): boolean {
    return (
      cc.isSubsetOf(this.remainingSchema(fd)) ||
      cc.isSubsetOf(this.generatingSchema(fd))
    );
  }

  /**
   * @returns the selected columns of each source (SourceTableInstance) of this table
   */
  public columnsBySource(): Map<SourceTableInstance, ColumnCombination> {
    const result = new Map<SourceTableInstance, ColumnCombination>();

    for (const source of this.sources) {
      result.set(source, new ColumnCombination());
    }

    for (const column of this.columns) {
      result.get(column.sourceTableInstance)!.add(column);
    }
    return result;
  }

  /**
   * Returns the sources of which not all rows of the original source table are found in this table
   */
  public reducedSources(): Array<SourceTableInstance> {
    const result = new Array<SourceTableInstance>();
    for (const rel of this.relationships) {
      const instance = new ColumnCombination(
        rel.referenced
      ).sourceTableInstance();
      if (result.includes(instance)) {
        console.error('one instance is referenced by multiple relationships');
        continue;
      }
      result.push(instance);
    }
    return result;
  }

  public isRoot(source: SourceTableInstance) {
    return !this.relationships.some(
      (rel) => rel.referenced[0].sourceTableInstance == source
    );
  }

  /**
   * @returns all sets of columns - each set coming mostly from the same SourceTableInstance - which match the sourceColumns.
   * Columns from other SourceTableInstances can be included in one match, if the columns have the same values as the
   * equivalent column from the same SourceTableInstance would have.
   * @param sourceColumns columns to be matched. Must come from the same SourceTable
   * @param allowReduced do we want matches which come from reduced sources (see reducedSources)
   */
  public columnsEquivalentTo(
    sourceColumns: Array<SourceColumn>,
    allowReduced: boolean
  ): Array<Array<Column>> {
    const result = new Array<Array<Column>>();
    const sourceTable = sourceColumns[0].table;

    const columnsBySource = this.columnsBySource();

    const ambiguous = new Map<Column, Column>();
    if (allowReduced) {
      for (const rel of this.relationships) {
        for (const i in rel.referencing) {
          columnsBySource
            .get(rel.referenced[i].sourceTableInstance)!
            .add(rel.referenced[i]);
          ambiguous.set(rel.referenced[i], rel.referencing[i]);
        }
      }
    }

    for (const [sourceTableInstance, columns] of columnsBySource.entries()) {
      if (!sourceTableInstance.table.equals(sourceTable)) continue;
      if (!allowReduced && this.reducedSources().includes(sourceTableInstance))
        continue;

      let equivalentColumns = columns.columnsEquivalentTo(sourceColumns, true);
      if (!equivalentColumns) continue;
      if (allowReduced) {
        const selectedEquivalentColumns = equivalentColumns.map((column) => {
          if (this.columns.includes(column)) return column;
          while (ambiguous.has(column)) {
            column = ambiguous.get(column)!;
            if (this.columns.includes(column)) return column;
          }
          return undefined;
        });
        if (selectedEquivalentColumns.some((column) => !column)) continue;
        equivalentColumns = selectedEquivalentColumns as Array<Column>;
      }
      result.push(equivalentColumns);
    }
    return result;
  }

  /**
   * returns all sources in an order so that every referenced table comes before their referencing table.
   */
  public sourcesTopological(): Array<SourceTableInstance> {
    const result = new Array<SourceTableInstance>();
    const numReferenced = new Map<SourceTableInstance, number>();
    const referencings = new Map<SourceTableInstance, SourceTableInstance>();

    for (const source of this.sources) {
      numReferenced.set(source, 0);
    }
    for (const rel of this.relationships) {
      const referencing = rel.referencing[0].sourceTableInstance;
      const referenced = rel.referenced[0].sourceTableInstance;
      numReferenced.set(referencing, numReferenced.get(referencing)! + 1);
      referencings.set(referenced, referencing);
    }
    while (numReferenced.size > 0) {
      const current = this.sources.find(
        (source) => numReferenced.get(source) == 0
      )!;
      result.push(current);
      numReferenced.delete(current);
      const referencing = referencings.get(current);
      if (referencing)
        numReferenced.set(referencing, numReferenced.get(referencing)! - 1);
    }
    return result;
  }

  public isKeyFd(fd: FunctionalDependency): boolean {
    // assume fd is fully extended
    // TODO what about null values
    return fd.rhs.equals(this.columns);
  }

  public minimalDeterminantsOf(
    columns: ColumnCombination
  ): Array<ColumnCombination> {
    const allClusters = Array.from(this.fdClusters).sort(
      (cluster1, cluster2) =>
        cluster1.columns.cardinality - cluster2.columns.cardinality
    );
    const determinants = new Array<ColumnCombination>();
    for (const cluster of allClusters) {
      if (!columns.isSubsetOf(cluster.columns)) continue;
      // if (
      //   !Array.from(relevantClusters).some((other) =>
      //     other.columns.isSubsetOf(cluster.columns)
      //   )
      // )
      for (const fd of cluster.fds) {
        if (!determinants.some((other) => other.isSubsetOf(fd.lhs)))
          determinants.push(fd.lhs);
      }
    }
    // determinants.slice(0, 50).forEach((det) => console.log(det.toString()));
    return determinants;
  }

  public isKey(columns: ColumnCombination): boolean {
    if (this.columns.isSubsetOf(columns)) return true;
    const rhs = columns.copy();
    for (const fd of this.fds) {
      if (fd.lhs.isSubsetOf(columns)) {
        rhs.union(fd.rhs);
        if (this.columns.isSubsetOf(rhs)) return true;
      }
    }
    return false;
  }

  public isBCNFViolating(fd: FunctionalDependency): boolean {
    if (this.isKeyFd(fd)) return false;
    if (fd.lhs.cardinality == 0) return false;
    return true;
  }

  public keys(): Array<ColumnCombination> {
    if (!this._keys) {
      let keys: Array<ColumnCombination> = this.fds
        .filter((fd) => this.isKeyFd(fd))
        .map((fd) => fd.lhs);
      if (keys.length == 0) keys.push(this.columns.copy());
      this._keys = keys.sort((cc1, cc2) => cc1.cardinality - cc2.cardinality);
    }
    return this._keys;
  }

  public violatingFds(): Array<FunctionalDependency> {
    if (!this._violatingFds) {
      this._violatingFds = this.fds
        .filter((fd) => this.isBCNFViolating(fd))
        .sort((fd1, fd2) => {
          let score1 = new FdScore(this, fd1).get();
          let score2 = new FdScore(this, fd2).get();
          if (score1 !== score2) return score2 - score1;
          const [fd1String, fd2String] = [fd1.toString(), fd2.toString()];
          if (fd1String < fd2String) return 1;
          if (fd2String < fd1String) return -1;
          return 0;
        });
    }
    return this._violatingFds;
  }

  /**
   * @returns FdClusters, which group functional dependencies that have the same right hand side
   * Used in UI to make functional dependencies easier to discover
   */
  public get fdClusters(): Array<FdCluster> {
    if (!this._fdClusters) {
      const fdClusterTree = new ColumnsTree<FdCluster>();
      if (this.pk)
        fdClusterTree.add(
          {
            columns: this.columns.copy(),
            fds: new Array(
              new FunctionalDependency(this.pk!.copy(), this.columns.copy())
            ),
          },
          this.columns.copy()
        );
      for (let fd of this.violatingFds()) {
        let cluster = fdClusterTree.get(fd.rhs);
        if (!cluster) {
          cluster = { columns: fd.rhs.copy(), fds: new Array() };
          fdClusterTree.add(cluster, cluster.columns);
        }
        cluster.fds.push(fd);
      }
      this._fdClusters = fdClusterTree.getAll();
    }
    return this._fdClusters;
  }

  public hull(columns: ColumnCombination): ColumnCombination {
    const rhs = columns.copy();
    for (const fd of this.fds) {
      if (fd.lhs.isSubsetOf(columns)) {
        rhs.union(fd.rhs);
      }
    }
    return rhs;
  }

  public toTestString(): string {
    let str = `${this.name}(${this.columns.toString()})\n`;
    str += this.fds.map((fd) => fd.toString()).join('\n');
    return str;
  }

  public toITable(): ITable {
    return {
      name: this.name,
      schemaName: this.schemaName,
      attributes: this.columns.asArray().map((attr) => attr.toIAttribute()),
    };
  }
}
