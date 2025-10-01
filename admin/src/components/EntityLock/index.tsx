// admin/src/components/EntityLock/index.tsx
import { Button, Typography } from '@strapi/design-system';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { io, type Socket } from 'socket.io-client';

import { useMatch, useNavigate } from 'react-router-dom';

import { Modal } from '@strapi/design-system';
import { useAuth, useFetchClient } from '@strapi/strapi/admin';
import { getTranslation } from '../../utils/getTranslation';

interface LockingRequestData {
  entityId: string;
  entityDocumentId?: string;
  userId: string | number;
}

interface LockingData {
  requestData: LockingRequestData;
  requestUrl: string;
}

const useLockingData = (): LockingData | null => {
  const collectionType = useMatch('/content-manager/collection-types/:entityId/:entityDocumentId');
  const singleType = useMatch('/content-manager/single-types/:entityId');
  const cloneCollectionType = useMatch('/content-manager/collection-types/:entityId/clone/:entityDocumentId');
  const user = useAuth('ENTITY_LOCK', (state) => state.user);

  if (!user || user.id === undefined) return null;

  if (collectionType?.params.entityId && collectionType?.params.entityDocumentId) {
    return {
      requestData: {
        entityId: collectionType.params.entityId,
        entityDocumentId: collectionType.params.entityDocumentId,
        userId: user.id,
      },
      requestUrl: `/record-locking/get-status/${collectionType.params.entityId}/${collectionType.params.entityDocumentId}`,
    };
  }
  
  if (singleType?.params.entityId) {
    return {
      requestData: {
        entityId: singleType.params.entityId,
        userId: user.id,
      },
      requestUrl: `/record-locking/get-status/${singleType.params.entityId}`,
    };
  }
  
  if (cloneCollectionType?.params.entityId && cloneCollectionType?.params.entityDocumentId) {
    return {
      requestData: {
        entityId: cloneCollectionType.params.entityId,
        entityDocumentId: cloneCollectionType.params.entityDocumentId,
        userId: user.id,
      },
      requestUrl: `/record-locking/get-status/${cloneCollectionType.params.entityId}/${cloneCollectionType.params.entityDocumentId}`,
    };
  }

  return null;
};

interface Settings {
  transports: string[];
}

interface LockStatus {
  isLocked: boolean;
  username: string;
  attemptEntityLocking: () => Promise<void>;
}

const useLockStatus = (): LockStatus | null => {
  const { get } = useFetchClient();
  const lockingData = useLockingData();

  const socket = useRef<Socket | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    get<Settings>('/record-locking/settings').then((response) => {
      setSettings(response.data);
    });
  }, [get]);

  const attemptEntityLocking = useCallback(async () => {
    if (!lockingData?.requestUrl) return;

    try {
      const lockingResponse = await get<{ editedBy: string } | false>(lockingData.requestUrl);
      if (!lockingResponse.data) {
        socket.current?.emit('openEntity', lockingData.requestData);
      } else {
        setIsLocked(true);
        setUsername(lockingResponse.data.editedBy);
      }
    } catch (error) {
      console.warn(error);
    }
  }, [lockingData, get]);

  useEffect(() => {
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');

    if (token && lockingData && lockingData.requestData.entityDocumentId !== 'create' && settings) {
      const parsedToken = token.startsWith('"') ? JSON.parse(token) : token;
      
      socket.current = io({
        reconnectionDelayMax: 10000,
        auth: {
          token: parsedToken,
        },
        transports: settings.transports,
      });

      // Wait for connection before locking
      socket.current.on('connect', () => {
        console.log('[Record Locking] Socket connected');
        attemptEntityLocking();
      });

      socket.current.on('connect_error', (error) => {
        console.error('[Record Locking] Connection error:', error);
      });

      socket.current.io.on('reconnect', attemptEntityLocking);
    }

    return () => {
      if (lockingData && lockingData.requestData.entityDocumentId !== 'create' && settings) {
        socket.current?.emit('closeEntity', lockingData.requestData);
        socket.current?.close();
      }
    };
  }, [settings, lockingData, attemptEntityLocking]);

  if (!lockingData?.requestUrl) return null;

  return {
    isLocked,
    username,
    attemptEntityLocking,
  };
};

export default function EntityLock() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const lockStatus = useLockStatus();
  const titleId = useId();

  if (!lockStatus) return null;

  return (
    lockStatus.isLocked && (
      <Modal.Root defaultOpen={true}>
        <Modal.Content>
          <Modal.Header>
            <Typography fontWeight="bold" textColor="neutral800" as="h2" id={titleId}>
              {formatMessage({
                id: getTranslation('ModalWindow.CurrentlyEditing'),
                defaultMessage: 'This entry is currently edited',
              })}
            </Typography>
          </Modal.Header>
          <Modal.Body>
            <Typography>
              {formatMessage(
                {
                  id: getTranslation('ModalWindow.CurrentlyEditingBody'),
                  defaultMessage: 'This entry is currently edited by {username}',
                },
                {
                  username: <Typography fontWeight="bold">{lockStatus.username}</Typography>,
                }
              )}
            </Typography>
          </Modal.Body>
          <Modal.Footer>
            <Modal.Close>
              <Button variant="tertiary">OK</Button>
            </Modal.Close>
            <Button
              onClick={() => {
                navigate(-1);
              }}
            >
              {formatMessage({
                id: getTranslation('ModalWindow.CurrentlyEditing.Button'),
                defaultMessage: 'Go Back',
              })}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    )
  );
}