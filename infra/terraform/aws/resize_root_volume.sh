#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
PUBLIC_IP="44.198.166.96"
TARGET_SIZE_GIB="30"

INSTANCE_ID=$(aws ec2 describe-instances \
  --region "$REGION" \
  --filters "Name=ip-address,Values=$PUBLIC_IP" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
  echo "Could not find instance by public IP $PUBLIC_IP"
  exit 1
fi

VOLUME_ID=$(aws ec2 describe-instances \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' \
  --output text)

CUR_SIZE=$(aws ec2 describe-volumes \
  --region "$REGION" \
  --volume-ids "$VOLUME_ID" \
  --query 'Volumes[0].Size' \
  --output text)

echo "INSTANCE_ID=$INSTANCE_ID"
echo "VOLUME_ID=$VOLUME_ID"
echo "CURRENT_SIZE_GIB=$CUR_SIZE"

if (( CUR_SIZE < TARGET_SIZE_GIB )); then
  echo "Resizing volume to ${TARGET_SIZE_GIB}GiB"
  aws ec2 modify-volume \
    --region "$REGION" \
    --volume-id "$VOLUME_ID" \
    --size "$TARGET_SIZE_GIB" >/dev/null
else
  echo "No resize needed"
fi

aws ec2 describe-volumes-modifications \
  --region "$REGION" \
  --volume-ids "$VOLUME_ID" \
  --query 'VolumesModifications[0].{State:ModificationState,OrigSize:OriginalSize,TargetSize:TargetSize}' \
  --output table
