/* @flow */

import React, { Component, PropTypes } from 'react/addons';
import invariant from 'invariant';
import { mapValues, reduce, isFunction, extend, isUndefined, clone, isEqual } from 'lodash';
import AdrenalineConnector from './AdrenalineConnector';
import getDisplayName from '../utils/getDisplayName';
import createAdaptorShape from '../adaptor/createAdaptorShape';
import createStoreShape from '../store/createStoreShape';

export default function createSmartComponent(DecoratedComponent, specs) {
  const displayName = `SmartComponent(${getDisplayName(DecoratedComponent)})`;
  invariant(!!specs,
    "Adrenaline smart component requires configuration.");
  invariant(!!specs.initialVariables ? !specs.variables : !!specs.variables,
    "Must specify either initialVariables or variables options, but not both.");
  invariant(!!specs.variables ? isFunction(specs.variables) : true,
    "Variables must be defined as a function of props, otherwise simply declare 'initialVariables'.");

  return class extends Component {
    static displayName = displayName
    static DecoratedComponent = DecoratedComponent

    static contextTypes = {
      Loading: PropTypes.func,
      adrenaline: createAdaptorShape(PropTypes),
      store: createStoreShape(PropTypes)
    }

    static childContextTypes = {
      Loading: PropTypes.func.isRequired,
      adrenaline: PropTypes.object.isRequired,
      store: createStoreShape(PropTypes).isRequired
    }

    constructor(props, context) {
      super(props, context);
      this.adrenaline = this.context.adrenaline;
      invariant(this.adrenaline, "Adrenaline must be provided via context");
      this.store = this.context.store;
      invariant(this.store, "Store must be provided via context");
      this.Loading = this.context.Loading;
      invariant(this.Loading, "Loading element must be provided via context");

      const initialVariables = specs.initialVariables || specs.variables || this.props;
      this.state = {
          uncommittedVariables: isFunction(initialVariables) ? initialVariables(props) : initialVariables
      };

      DecoratedComponent.prototype.setVariables = this.setVariables.bind(this);

      this.mutations = mapValues(specs.mutations, m => {
        return (params, files) => {
            const { adrenaline, store } = this
            adrenaline.performMutation(store, m, params, files);
        }
      });
    }

    setVariables(nextVariables){
      const uncommittedVariables = clone(extend(this.state.uncommittedVariables, nextVariables));
      this.setState({ uncommittedVariables: uncommittedVariables }, () => this.fetch(uncommittedVariables));
    }

    componentWillMount(){
        this.fetch(this.state.uncommittedVariables);
    }

    componentWillReceiveProps(nextProps) {
        if(isFunction(specs.variables)
            && nextProps != this.props
            && !isEqual(nextProps, this.props)){
            this.setVariables(specs.variables(nextProps))
        }
    }

    /*shouldComponentUpdate(nextProps) {
      return !shadowEqualScalar(this.props, nextProps);
    }*/

    fetch(uncommittedVariables) {
      const { adrenaline, store } = this;
      const { query } = specs;

      adrenaline.performQuery(store, query, uncommittedVariables)
        .then(()=>{
          this.setState({ variables: clone(uncommittedVariables) || null });
        })
        .catch((err)=>{
          console.error('Query failed', {
            variables: uncommittedVariables,
            query: query(uncommittedVariables)
          }, err);
          return Promise.reject(err);
        });
    }

    renderDecoratedComponent({variables, props}) {
      return (
        <DecoratedComponent {...this.props} {...props}
          adrenaline={extend({},
              this.state,
              {
                  variables,
                  slice: props,
                  query: specs.query(variables)
              }
          )}
          mutations={this.mutations} />
      );
    }

    render() {
      const dataLoaded = !isUndefined(this.state.variables);
      if (!dataLoaded) {
        const { Loading } = this;
        return <Loading />;
      }
      const { store, adrenaline } = this;
      const { variables } = this.state;

      return (
        <AdrenalineConnector
            store={store}
            adrenaline={adrenaline}
            query={specs.query}
            variables={variables}>
          {this.renderDecoratedComponent.bind(this)}
        </AdrenalineConnector>
      );
    }
  };
}
